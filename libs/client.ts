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
 * @param client - The RealtimeClient instance.
 * @param message - The incoming message to reply to.
 * @returns A function that sends a reply.
 * @throws Error if the connection ID is not available in the message.
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
 */
class WaitFor implements WaitForFactory {
  private client: RealtimeClient
  private options: MessageOptions

  /**
   * Initializes a new instance of the WaitFor class.
   *
   * @param client - The RealtimeClient instance.
   * @param options - The message options.
   */
  constructor(client: RealtimeClient, options: MessageOptions) {
    this.client = client
    this.options = options
  }

  /**
   * Waits for an acknowledgement of the message.
   *
   * @param timeout - The timeout in milliseconds (default is 5000 ms).
   * @returns A promise that resolves when an acknowledgement is received.
   */
  waitForAck(timeout: number = 5000): CancelablePromise<any[]> {
    return this.client.waitFor(`ack.${this.options.id}`, {
      timeout,
    } as WaitForOptions)
  }

  /**
   * Waits for a reply to the message.
   *
   * @param timeout - The timeout in milliseconds (default is 5000 ms).
   * @returns A promise that resolves when a reply is received.
   */
  waitForReply(timeout: number = 5000): CancelablePromise<any[]> {
    return this.client.waitFor(`response.${this.options.id}`, {
      timeout,
    } as WaitForOptions)
  }
}

/**
 * RealtimeClient class encapsulates WebSocket connection, subscription, and message handling.
 */
export class RealtimeClient extends EventEmitter2 {
  private ws: ReconnectingWebSocket | null = null
  private opts: ClientOptions

  /**
   * Initializes a new instance of the RealtimeClient class.
   *
   * @param config - The client configuration options.
   */
  constructor(config: ClientOptions) {
    super({...config.emitterOptions, wildcard: true})
    this.opts = config

    // Listen for acknowledgement messages
    this.on('priv/acks.ack', (message: IncomingMessage) => {
      this.opts.logger?.debug('Received ack:', message.data)
      this.emit(`ack.${message.data.data}`)
    })

    // Listen for response messages
    this.on('*.response', (message: IncomingMessage) => {
      if (message.topic.startsWith('priv/')) {
        this.opts.logger?.debug('Received response:', message.data)
        const res = message.data.payload as ResponseMessage
        this.emit(`response.${res.id}`, res)
      }
    })

    // Wait for 'welcome' message to trigger session.started event
    this.on('main.welcome', (message: IncomingMessage) => {
      this.opts.logger?.info('Session started!')

      this.emit('session.started', message.data.connection)
    })
  }

  /**
   * Establishes a connection to the WebSocket server.
   *
   * @returns A promise that resolves with the connection information.
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

      this.ws.onmessage = this.onMessage.bind(this)
      this.ws.onerror = (event: ErrorEvent) => {
        const error = new Error('WebSocket error event')
        this.handleError(error)

        reject(error)
      }
      this.ws.onclose = this.handleClose.bind(this)

      resolve()
    })
  }

  /**
   * Disconnects from the WebSocket server.
   *
   * @returns The RealtimeClient instance.
   */
  disconnect(): RealtimeClient {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    return this
  }

  /**
   * Publishes a message to a topic.
   *
   * @param topic - The topic to publish to.
   * @param payload - The message payload.
   * @param options - The message options.
   * @returns A WaitForFactory instance to wait for acknowledgements or replies.
   * @throws Error if the WebSocket connection is not established.
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
   * Sends a message to the server.
   *
   * @param payload - The message payload.
   * @param options - The message options.
   * @returns A WaitForFactory instance to wait for acknowledgements or replies.
   * @throws Error if the WebSocket connection is not established.
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
   * Subscribes to a topic.
   *
   * @param topic - The topic to subscribe to.
   * @returns The RealtimeClient instance.
   * @throws Error if the WebSocket connection is not established.
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
   * Unsubscribes from a topic.
   *
   * @param topic - The topic to unsubscribe from.
   * @returns The RealtimeClient instance.
   * @throws Error if the WebSocket connection is not established.
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
   * Waits for a specified duration.
   *
   * @param ms - The duration to wait in milliseconds.
   * @returns A promise that resolves after the specified time.
   */
  wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Generates a random identifier string.
   *
   * @returns A random string.
   */
  private getRandomId(): string {
    return Math.random().toString(36).substring(2)
  }

  /**
   * Handles incoming WebSocket messages.
   *
   * @param event - The message event from the WebSocket.
   */
  private async onMessage(event: MessageEvent): Promise<void> {
    let messageData: any

    try {
      if (this.opts.websocketOptions.messageDeserializer) {
        messageData = this.opts.websocketOptions.messageDeserializer(event.data)
      } else if (event.data instanceof Blob) {
        messageData = JSON.parse(await event.data.text())
      } else if (typeof event.data === 'string') {
        messageData = JSON.parse(event.data)
      } else if (event.data instanceof ArrayBuffer) {
        messageData = JSON.parse(new TextDecoder().decode(event.data))
      } else {
        throw new Error('Unable to deserialize incoming message')
      }
    } catch (error) {
      this.handleError(error)
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
      this.emit(
        `${topic}.${messageType}`,
        messageEvent,
        reply(this, messageEvent),
      )
    }
  }

  /**
   * Handles WebSocket errors.
   *
   * @param error - The error object.
   */
  private handleError(error: Error): void {
    this.opts.logger?.error('WebSocket error:', error)

    this.emit('error', error)
  }

  /**
   * Handles WebSocket closure events.
   *
   * @param event - The close event from the WebSocket.
   */
  private handleClose(event: CloseEvent): void {
    this.opts.logger?.info('WebSocket closed:', {
      code: event.code,
      reason: event.reason,
    })
    this.emit('close', event)
  }
}
