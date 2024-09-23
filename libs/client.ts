import {CancelablePromise, EventEmitter2, WaitForOptions} from 'eventemitter2'
import {
  MessageOptions,
  IncomingMessage,
  ClientOptions,
  ResponseMessage,
  ReplyFunction,
  WaitForFactory,
} from './interfaces'
import ReconnectingWebSocket from 'reconnecting-websocket'

/**
 * Creates a reply function for the given client and message.
 *
 * This function generates a `ReplyFunction` that can be used to send a response back to the sender
 * of the incoming message. It ensures that the reply is correctly routed to the appropriate connection.
 *
 * @param client - The `RealtimeClient` instance used to send the reply.
 * @param message - The incoming message to which the reply is responding.
 * @returns A `ReplyFunction` that sends a reply message.
 * @throws Error if the connection ID is not available in the incoming message.
 */
const reply =
  (client: RealtimeClient, message: IncomingMessage): ReplyFunction =>
  (
    data: any,
    status: string = 'ok',
    options?: MessageOptions,
  ): WaitForFactory => {
    const connectionId = message.data.client?.connectionId
    if (connectionId) {
      return client.publish(
        `priv/${connectionId}`,
        {
          data,
          status,
          id: message.data.id,
        } as ResponseMessage,
        {
          messageType: 'response',
          compress: options?.compress,
        },
      )
    } else {
      throw new Error('Connection ID is not available in the message')
    }
  }

/**
 * Class representing a factory for waiting on acknowledgements or replies.
 *
 * The `WaitFor` class provides methods to wait for acknowledgements from the Messaging Gateway
 * or replies from other subscribers or backend services. It is used in conjunction with
 * message publishing and sending methods to ensure reliable communication.
 */
class WaitFor implements WaitForFactory {
  private client: RealtimeClient
  private options: MessageOptions

  /**
   * Initializes a new instance of the `WaitFor` class.
   *
   * @param client - The `RealtimeClient` instance associated with this factory.
   * @param options - The message options used for publishing or sending messages.
   */
  constructor(client: RealtimeClient, options: MessageOptions) {
    this.client = client
    this.options = options
  }

  waitForAck(timeout: number = 5000): CancelablePromise<any[]> {
    return this.client.waitFor(`ack.${this.options.id}`, {
      timeout,
    } as WaitForOptions)
  }

  waitForReply(timeout: number = 5000): CancelablePromise<any[]> {
    return this.client.waitFor(`response.${this.options.id}`, {
      timeout,
    } as WaitForOptions)
  }
}

/**
 * RealtimeClient class encapsulates WebSocket connection, subscription, and message handling.
 *
 * The `RealtimeClient` is the core class for interacting with the Realtime Pub/Sub service. It manages the WebSocket
 * connection, handles message publishing and subscribing, and provides mechanisms to wait for acknowledgements and replies.
 */
export class RealtimeClient extends EventEmitter2 {
  private ws: ReconnectingWebSocket | null = null
  private opts: ClientOptions

  /**
   * Initializes a new instance of the `RealtimeClient` class.
   *
   * @param config - The client configuration options, including WebSocket settings, logger, and event emitter options.
   */
  constructor(config: ClientOptions) {
    super({...config.emitterOptions, wildcard: true})
    this.opts = config

    // Listen for acknowledgment messages from the Messaging Gateway
    this.on('priv/acks.ack', (message: IncomingMessage) => {
      this.opts.logger?.debug('Received ack:', message.data)
      this.emit(`ack.${message.data.data}`)
    })

    // Listen for response messages from other subscribers or backend services
    this.on('*.response', (message: IncomingMessage) => {
      if (message.topic.startsWith('priv/')) {
        this.opts.logger?.debug('Received response:', message.data)
        const res = message.data.payload as ResponseMessage
        this.emit(`response.${res.id}`, res)
      }
    })

    // Listen for the 'welcome' message to trigger the 'session.started' event
    this.on('main.welcome', (message: IncomingMessage) => {
      this.opts.logger?.info('Session started!')

      this.emit('session.started', message.data.connection)
    })
  }

  /**
   * Establishes a connection to the WebSocket server.
   *
   * Initiates the WebSocket connection using the provided URL from the `urlProvider` function.
   * Sets up event handlers for incoming messages, errors, and closure events.
   *
   * @returns A promise that resolves when the connection is successfully established.
   *
   * @throws `Error` if the WebSocket instance is not initialized or if an error occurs during connection.
   */
  async connect(): Promise<void> {
    this.ws = new ReconnectingWebSocket(
      this.opts.websocketOptions.urlProvider,
      [],
      this.opts.websocketOptions,
    )

    return new Promise((resolve, reject) => {
      if (!this.ws) {
        return reject(new Error('WebSocket instance is not initialized'))
      }

      // Bind the onMessage handler to process incoming WebSocket messages
      this.ws.onmessage = this.onMessage.bind(this)

      // Handle WebSocket errors
      this.ws.onerror = (event: ErrorEvent) => {
        const error = new Error('WebSocket error event')
        this.handleError(error)

        reject(error)
      }

      // Handle WebSocket closure
      this.ws.onclose = this.handleClose.bind(this)

      resolve()
    })
  }

  /**
   * Disconnects from the WebSocket server.
   *
   * Closes the active WebSocket connection and cleans up resources.
   *
   * @returns The `RealtimeClient` instance for method chaining.
   */
  disconnect(): RealtimeClient {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    return this
  }

  /**
   * Publishes a message to a specified topic.
   *
   * Sends a message payload to the designated topic, allowing subscribers to receive and process it.
   * Returns a `WaitForFactory` instance to enable waiting for acknowledgements or replies.
   *
   * @param topic - The topic to publish the message to.
   * @param payload - The message payload, which can be a string or an object.
   * @param options - Optional message options, including `id`, `messageType`, and `compress`.
   *
   * @returns A `WaitForFactory` instance to wait for acknowledgements or replies.
   *
   * @throws `Error` if the WebSocket connection is not established.
   *
   * @example
   * ```typescript
   * await client.publish('chat', 'Hello, world!', { messageType: 'text-message' }).waitForAck();
   * ```
   */
  publish(
    topic: string,
    payload: string | Record<string, any>,
    options?: MessageOptions,
  ): WaitForFactory {
    if (!this.ws) {
      throw new Error('WebSocket connection is not established')
    }

    options = options || {}
    options.id = options.id || this.getRandomId()

    this.ws.send(
      JSON.stringify({
        type: 'publish',
        data: {
          topic,
          messageType: options.messageType,
          compress: options.compress,
          payload,
          id: options.id,
        },
      }),
    )

    return new WaitFor(this, options)
  }

  /**
   * Sends a message directly to the server.
   *
   * Useful for scenarios where you need to send messages to backend services.
   * Returns a `WaitForFactory` instance to enable waiting for acknowledgements or replies.
   *
   * **Reference:**
   * - [WebSocket Inbound Messaging Documentation](https://realtime.21no.de/documentation/#websocket-inbound-messaging)
   *
   *
   * @param payload - The message payload, which can be a string or an object.
   * @param options - Optional message options, including `id`, `messageType`, and `compress`.
   *
   * @returns A `WaitForFactory` instance to wait for acknowledgements or replies.
   *
   * @throws `Error` if the WebSocket connection is not established.
   *
   * @example
   * ```typescript
   * const [response] = await client.send('Get server status', { messageType: 'get-status' }).waitForReply();
   * console.log('Server status:', response.data.status);
   * ```
   */
  send(
    payload: string | Record<string, any>,
    options?: MessageOptions,
  ): WaitForFactory {
    if (!this.ws) {
      throw new Error('WebSocket connection is not established')
    }

    options = options || {}
    options.id = options.id || this.getRandomId()

    this.ws.send(
      JSON.stringify({
        type: 'message',
        data: {
          messageType: options.messageType,
          compress: options.compress,
          payload,
          id: options.id,
        },
      }),
    )

    return new WaitFor(this, options)
  }

  /**
   * Subscribes to a remote topic to receive messages.
   *
   * Establishes a subscription to the specified topic, enabling the client to receive messages published to it.
   *
   * @param topic - The topic to subscribe to.
   *
   * @returns The `RealtimeClient` instance for method chaining.
   *
   * @throws `Error` if the WebSocket connection is not established.
   *
   * @example
   * ```typescript
   * client.subscribeRemoteTopic('notifications');
   * ```
   */
  subscribeRemoteTopic(topic: string): RealtimeClient {
    if (this.ws) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe',
          data: {topic},
        }),
      )

      return this
    } else {
      throw new Error('WebSocket connection is not established')
    }
  }

  /**
   * Unsubscribes from a previously subscribed topic.
   *
   * Removes the subscription to the specified topic, stopping the client from receiving further messages from it.
   *
   * @param topic - The topic to unsubscribe from.
   *
   * @returns The `RealtimeClient` instance for method chaining.
   *
   * @throws `Error` if the WebSocket connection is not established.
   *
   * @example
   * ```typescript
   * client.unsubscribeRemoteTopic('notifications');
   * ```
   */
  unsubscribeRemoteTopic(topic: string): RealtimeClient {
    if (this.ws) {
      this.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          data: {topic},
        }),
      )

      return this
    } else {
      throw new Error('WebSocket connection is not established')
    }
  }

  /**
   * Waits for a specified duration before proceeding.
   *
   * Useful for introducing delays or pacing message sending in your application flow.
   *
   * @param ms - The duration to wait in milliseconds.
   *
   * @returns A promise that resolves after the specified time.
   *
   * @example
   * ```typescript
   * await client.wait(1000); // Wait for 1 second
   * ```
   */
  wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Generates a random identifier string.
   *
   * Utilizes a simple random string generation method to create unique message identifiers.
   *
   * @returns A random string suitable for use as a message ID.
   *
   * @example
   * ```typescript
   * const messageId = client.getRandomId();
   * ```
   */
  private getRandomId(): string {
    return Math.random().toString(36).substring(2)
  }

  /**
   * Handles incoming WebSocket messages.
   *
   * Processes messages received from the WebSocket connection, deserializes them,
   * and emits appropriate events based on the message topic and type.
   *
   * @param event - The message event received from the WebSocket.
   */
  private async onMessage(event: MessageEvent): Promise<void> {
    let messageData: any

    try {
      if (this.opts.websocketOptions.messageDeserializer) {
        // Use custom message deserializer if provided
        messageData = this.opts.websocketOptions.messageDeserializer(event.data)
      } else if (event.data instanceof Blob) {
        // Handle Blob data by converting to text
        messageData = JSON.parse(await event.data.text())
      } else if (typeof event.data === 'string') {
        // Handle string data by parsing JSON
        messageData = JSON.parse(event.data)
      } else if (event.data instanceof ArrayBuffer) {
        // Handle ArrayBuffer data by decoding to string
        messageData = JSON.parse(new TextDecoder().decode(event.data))
      } else {
        throw new Error('Unable to deserialize incoming message')
      }
    } catch (error) {
      // Handle deserialization errors
      this.handleError(error as Error)
      return
    }

    const {topic, messageType, data} = messageData
    const messageEvent: IncomingMessage = {
      topic,
      messageType,
      data,
      compression: typeof event.data !== 'string',
    }

    this.opts.logger?.debug('> Incoming message:', messageEvent)

    if (messageType) {
      // Emit an event based on the topic and message type
      this.emit(
        `${topic}.${messageType}`,
        messageEvent,
        reply(this, messageEvent),
      )
    }
  }

  /**
   * Handles WebSocket errors by logging and emitting an 'error' event.
   *
   * @param error - The error object encountered during WebSocket communication.
   */
  private handleError(error: Error): void {
    this.opts.logger?.error('WebSocket error:', error)

    this.emit('error', error)
  }

  /**
   * Handles WebSocket closure events by logging and emitting a 'close' event.
   *
   * @param event - The close event received from the WebSocket.
   */
  private handleClose(event: CloseEvent): void {
    this.opts.logger?.info('WebSocket closed:', {
      code: event.code,
      reason: event.reason,
    })
    this.emit('close', event)
  }
}
