import {CancelablePromise, ConstructorOptions} from 'eventemitter2'
import {Options} from 'reconnecting-websocket'

/**
 * Interface representing connection information.
 */
export interface ConnectionInfo {
  id: string
  appId: string
  remoteAddress: string
}

/**
 * Interface representing options for outgoing messages.
 */
export interface MessageOptions {
  id?: string
  messageType?: string
  compress?: boolean
}

export interface ReplyFunction {
  (data: any, status: string, options?: MessageOptions): WaitForFactory
}

/**
 * Interface representing a response message.
 */
export interface ResponseMessage {
  id: string
  status: string
  data: any
}

/**
 * Logger interface.
 */
export interface Logger {
  log: (message: string, data?: unknown) => void
  info: (message: string, data?: unknown) => void
  error: (message: string, err?: Error) => void
  debug: (message: string, data?: unknown) => void
}

/**
 * WebSocket options interface.
 */
type WebSocketOptions = {
  urlProvider: () => Promise<string>
  messageDeserializer?: (data: any) => Object
} & Options

/**
 * Configuration interface for the RealtimeClient.
 */
export interface ClientOptions {
  websocketOptions: WebSocketOptions
  logger?: Logger
  emitterOptions?: ConstructorOptions
}

/**
 * Incoming message event interface.
 */
export interface IncomingMessage {
  topic: string
  messageType: string
  data: any
  compression: boolean
}

export interface WaitForFactory {
  waitForAck: (timeout?: number) => CancelablePromise<any[]>
  waitForReply: (timeout?: number) => CancelablePromise<any[]>
}
