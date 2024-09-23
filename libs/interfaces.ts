import {CancelablePromise, ConstructorOptions} from 'eventemitter2'
import {Options} from 'reconnecting-websocket'

/**
 * Interface representing connection information.
 *
 * Provides details about the WebSocket connection established with the Realtime Pub/Sub service.
 */
export interface ConnectionInfo {
  /**
   * Unique identifier for the WebSocket connection.
   *
   * Used to track and manage individual connections within the application.
   */
  id: string

  /**
   * Identifier for the application.
   *
   * Useful for distinguishing connections from different applications or services.
   */
  appId: string

  /**
   * Remote address of the client.
   *
   * Indicates the IP address or hostname of the client establishing the connection.
   */
  remoteAddress: string
}

/**
 * Interface representing options for outgoing messages.
 *
 * Configures various aspects of messages sent to the Realtime Pub/Sub service.
 */
export interface MessageOptions {
  /**
   * Optional message identifier.
   *
   * If not provided, a unique identifier is automatically generated for the message.
   */
  id?: string

  /**
   * Optional type of the message.
   *
   * Used to categorize or handle different types of messages appropriately. Default value: `'broadcast'`.
   */
  messageType?: string

  /**
   * Indicates whether to compress the message payload before sending.
   *
   * Compression can reduce the size of the message, leading to faster transmission times.
   */
  compress?: boolean
}

/**
 * Function type for sending replies to incoming messages.
 *
 * Enables responding to messages received from other subscribers or backend services.
 */
export interface ReplyFunction {
  /**
   * Sends a reply to an incoming message.
   *
   * @param data - The payload to send in the reply.
   * @param status - Status string indicating the result of the reply, e.g., `'ok'` or `'error'`.
   * @param options - Optional message options for the reply.
   *
   * @returns A `WaitForFactory` instance to wait for acknowledgements or further replies.
   */
  (data: any, status: string, options?: MessageOptions): WaitForFactory
}

/**
 * Interface representing a response message.
 *
 * Defines the structure of messages sent in response to incoming messages.
 */
export interface ResponseMessage {
  /**
   * Identifier of the original message to which this is a response.
   *
   * Ensures that the reply corresponds to the correct request.
   */
  id: string

  /**
   * Status of the response.
   *
   * Indicates the outcome of processing the original message, e.g., `'ok'` or `'error'`.
   */
  status: string

  /**
   * Response payload containing relevant data.
   *
   * Carries the actual data being sent in the reply.
   */
  data: any
}

/**
 * Logger interface.
 *
 * Defines methods for logging various levels of messages within the `RealtimeClient`.
 * Allows integration with custom logging systems.
 */
export interface Logger {
  /**
   * General log method for informational messages.
   *
   * @param message - The message to log.
   * @param data - Optional additional data to include with the log message.
   */
  log: (message: string, data?: unknown) => void

  /**
   * Informational log method.
   *
   * @param message - The informational message to log.
   * @param data - Optional additional data to include with the log message.
   */
  info: (message: string, data?: unknown) => void

  /**
   * Error log method.
   *
   * @param message - The error message to log.
   * @param err - Optional `Error` object providing stack trace and additional error details.
   */
  error: (message: string, err?: Error) => void

  /**
   * Debug log method.
   *
   * @param message - The debug message to log.
   * @param data - Optional additional data to include with the debug message.
   */
  debug: (message: string, data?: unknown) => void
}

/**
 * WebSocket options interface.
 *
 * Configures the behavior and settings of the WebSocket connection used by the `RealtimeClient`.
 */
type WebSocketOptions = {
  /**
   * Function that returns the WebSocket URL.
   *
   * Typically includes authentication tokens or other necessary parameters for establishing the connection.
   *
   * @returns A promise that resolves to the WebSocket URL as a string.
   */
  urlProvider: () => Promise<string>

  /**
   * Optional custom message deserializer function.
   *
   * Transforms incoming WebSocket messages into JavaScript objects.
   * Useful for handling custom message formats or protocols.
   *
   * @param data - The raw data received from the WebSocket.
   * @returns An object representing the deserialized message.
   */
  messageDeserializer?: (data: any) => Object
} & Options

/**
 * Configuration interface for the RealtimeClient.
 *
 * Specifies all necessary settings and options required to initialize and operate the `RealtimeClient`.
 */
export interface ClientOptions {
  /**
   * Configuration for the WebSocket connection.
   *
   * Includes the URL provider and optional message deserializer.
   */
  websocketOptions: WebSocketOptions

  /**
   * Optional custom logger for logging events and errors.
   *
   * Must implement the `Logger` interface.
   */
  logger?: Logger

  /**
   * Optional configuration options for the underlying `EventEmitter2`.
   *
   * Allows customization of event handling behaviors, such as enabling wildcard events.
   */
  emitterOptions?: ConstructorOptions
}

/**
 * Incoming message event interface.
 *
 * Represents the structure of messages received from the Realtime Pub/Sub service.
 */
export interface IncomingMessage {
  /**
   * The topic of the message.
   *
   * Used to categorize or route messages to appropriate handlers.
   */
  topic: string

  /**
   * The type of the message.
   *
   * Helps in determining how to process or respond to the message.
   */
  messageType: string

  /**
   * The message payload containing relevant data.
   *
   * Carries the actual information or commands sent within the message.
   */
  data: any

  /**
   * Indicates if the message payload is compressed.
   *
   * Useful for determining if compression was applied to the message.
   */
  compression: boolean
}

/**
 * Factory for waiting on acknowledgements or replies.
 *
 * Provides methods to wait for acknowledgements from the Messaging Gateway or replies from other subscribers/services.
 */
export interface WaitForFactory {
  /**
   * Waits for an acknowledgment from the Messaging Gateway indicating that the message has been successfully received.
   *
   * This method ensures reliable message delivery by confirming that the Messaging Gateway has acknowledged receipt of the sent message.
   * It is essential for scenarios where message delivery confirmation is required to maintain data consistency and application integrity.
   *
   * **Prerequisite:**
   * - **"WebSocket Inbound ACK"** must be enabled in your application settings. This feature allows the Messaging Gateway to send acknowledgment events
   *   back to the client over the WebSocket connection.
   *
   * @param timeout - The maximum duration to wait for the acknowledgment in milliseconds. Defaults to `5000` ms.
   *
   * @returns A `CancelablePromise<any[]>` that resolves when the acknowledgment is received or rejects if the timeout is exceeded.
   *
   * @throws `Error` if the acknowledgment is not received within the specified timeout period.
   * @throws `Error` if the WebSocket connection is not established or has been closed.
   */
  waitForAck: (timeout?: number) => CancelablePromise<any[]>

  /**
   * Waits for a reply message from another subscriber or your backend service in response to a previously sent message.
   *
   * This method is essential for implementing request-response patterns within your real-time applications. By waiting for a reply,
   * you can ensure that your application receives the necessary responses to the messages it sends, enabling synchronous-like interactions
   * over the inherently asynchronous WebSocket protocol.
   *
   * **Prerequisite:**
   * - Ensure that the recipient of the message (another subscriber or your backend service) is set up to send a reply message.
   *
   * @param timeout - The maximum duration to wait for the reply in milliseconds. Defaults to `5000` ms.
   *
   * @returns A `CancelablePromise<any[]>` that resolves with an array containing the reply message when received, or rejects if the timeout is exceeded.
   *
   * @throws `Error` if a reply is not received within the specified timeout period.
   * @throws `Error` if the WebSocket connection is not established or has been closed.
   */
  waitForReply: (timeout?: number) => CancelablePromise<any[]>
}
