# Realtime Pub/Sub Client

The `realtime-pubsub-client` is a JavaScript client library for interacting with [Realtime Pub/Sub](https://realtime.21no.de) applications. It enables developers to manage real-time WebSocket connections, handle subscriptions, and process messages efficiently. The library provides a simple and flexible API to interact with realtime applications, supporting features like publishing/sending messages, subscribing to topics, handling acknowledgements, and waiting for replies with timeout support.

## Features

- **WebSocket Connection Management**: Seamlessly connect and disconnect from the Realtime Pub/Sub service with automatic reconnection support.
- **Topic Subscription**: Subscribe and unsubscribe to topics for receiving messages.
- **Topic Publishing**: [Publish](https://realtime.21no.de/documentation/#publishers) messages to specific topics with optional message types and compression.
- **Message Sending**: [Send](https://realtime.21no.de/documentation/#websocket-inbound-messaging) messages to backend applications with optional message types and compression.
- **Event Handling**: Handle incoming messages with custom event listeners.
- **Acknowledgements and Replies**: Wait for gateway acknowledgements or replies to messages with timeout support.
- **Error Handling**: Robust error handling and logging capabilities.
- **TypeScript Support**: Strongly typed classes for better development experience.

## Installation

Install the `realtime-pubsub-client` library via npm:

```bash
npm install realtime-pubsub-client
```

Or via yarn:

```bash
yarn add realtime-pubsub-client
```

## Getting Started

This guide will help you set up and use the `realtime-pubsub-client` library in your TypeScript or JavaScript project.

### Connecting to the Server

First, import the `RealtimeClient` class and create a new instance with the required configuration:

```typescript
import {
  RealtimeClient,
  ClientOptions,
  ConnectionInfo,
} from 'realtime-pubsub-client'

const APP_ID = 'your-app-id'

const clientOptions: ClientOptions = {
  websocketOptions: {
    // https://www.npmjs.com/package/reconnecting-websocket#available-options
    maxRetries: 10,
    urlProvider: async () => {
      // Implement getAuthToken according to your auth mechanism
      const ACCESS_TOKEN = await getAuthToken()

      return `wss://genesis.r7.21no.de/apps/${APP_ID}?access_token=${ACCESS_TOKEN}`
    },
  },
  // Optional: Pass a custom logger implementing the Logger interface
  logger: console,
}

const client = new RealtimeClient(clientOptions)
```

Connecting to the server and handling the `session.started` event:

```typescript
client.on('session.started', (connectionInfo: ConnectionInfo) => {
  console.log('Connection ID:', connectionInfo.id)

  // subscribe to topics here
  client.subscribeRemoteTopic('topic1')
  client.subscribeRemoteTopic('topic2')
  // ...
})

await client.connect()
await client.waitFor('session.started')
```

### Subscribing to incoming messages

You can handle messages for specific topics and message types:

> Note: The topic and message type are separated by a dot (.) in the event name.

```typescript
client.on('topic1.action1', (message: IncomingMessage) => {
  // message handling logic here
  console.log('Received message:', message.data.payload)
})
```

Wildcard subscriptions are also supported:

```typescript
client.on('topic1.*', (message: IncomingMessage) => {
  // ...
})
```

### Publishing Messages

Publish messages to a topic:

```typescript
client.publish('topic1', 'Hello, world!', {
  messageType: 'text-message',
})
```

### Responding to Incoming Messages

Set up event listeners to handle incoming messages:

```typescript
client.on(
  'topic1.text-message',
  (message: IncomingMessage, reply: ReplyFunction) => {
    // ...

    // sending a reply
    reply('Message received!', 'ok')
  },
)
```

### Waiting for Acknowledgements and Replies

- **waitForAck(timeout?: number)**: Waits for an acknowledgement of the message, with an optional timeout in milliseconds.
- **waitForReply(timeout?: number)**: Waits for a reply to the message, with an optional timeout in milliseconds.

Wait for the Realtime Gateway acknowledgement after publishing a message:

```typescript
await client
  .publish('secure/peer-to-peer1', 'Hi', {
    messageType: 'greeting',
  })
  .waitForAck()
```

Wait for the Realtime Gateway acknowledgement after sending a message:

```typescript
await client
  .send(
    {
      /*...*/
    },
    {
      messageType: 'create',
    },
  )
  .waitForAck()
```

Wait for a reply with a timeout:

```typescript
await client
  .send(
    {
      /*...*/
    },
    {
      messageType: 'create',
    },
  )
  .waitForReply(5000) // Wait for up to 5 seconds
```

### Error Handling

Handle errors and disconnections:

```typescript
client.on('error', (error: Error) => {
  console.error('WebSocket error:', error)
})

client.on('close', (event: CloseEvent) => {
  console.log('WebSocket closed:', event.reason)
})
```

## API Reference

### RealtimeClient

#### Constructor

```typescript
new RealtimeClient(config: ClientOptions);
```

Creates a new `RealtimeClient` instance.

- **config**: Configuration options for the client.

#### Methods

- **connect()**: Connects client to the WebSocket Messaging Gateway.

  ```typescript
  async connect(): Promise<void>;
  ```

  Returns a promise that resolves when the connection is established.

- **disconnect()**: Terminates the WebSocket connection.

  ```typescript
  disconnect(): RealtimeClient;
  ```

  Returns the `RealtimeClient` instance.

- **subscribeRemoteTopic(topic: string)**: [Subscribes](https://realtime.21no.de/documentation/#subscribers) connection to a remote topic.

  ```typescript
  subscribeRemoteTopic(topic: string): RealtimeClient;
  ```

  Returns the `RealtimeClient` instance.

- **unsubscribeRemoteTopic(topic: string)**: [Unsubscribes](https://realtime.21no.de/documentation/#subscribers) connection from a remote topic.

  ```typescript
  unsubscribeRemoteTopic(topic: string): RealtimeClient;
  ```

  Returns the `RealtimeClient` instance.

- **publish(topic: string, payload: string | Record<string, any>, options?: MessageOptions)**: Publishes a message to a topic.

  ```typescript
  publish(topic: string, payload: string | Record<string, any>, options?: MessageOptions): WaitForFactory;
  ```

  Returns a `WaitForFactory` instance to wait for acknowledgements or replies.

- **send(payload: string | Record<string, any>, options?: MessageOptions)**: Sends a message to the server.

  ```typescript
  send(payload: string | Record<string, any>, options?: MessageOptions): WaitForFactory;
  ```

  Returns a `WaitForFactory` instance to wait for acknowledgements or replies.

- **wait(ms: number)**: Waits for a specified duration. Utility function for waiting in async functions.

  ```typescript
  wait(ms: number): Promise<void>;
  ```

  Returns a promise that resolves after the specified time.

#### Events

- **'session.started'**: Emitted when the session starts.

  ```typescript
  client.on('session.started', (connectionInfo: ConnectionInfo) => { ... });
  ```

- **'error'**: Emitted on WebSocket errors.

  ```typescript
  client.on('error', (error: Error) => { ... });
  ```

- **'close'**: Emitted when the WebSocket connection closes.

  ```typescript
  client.on('close', (event: CloseEvent) => { ... });
  ```

- **Custom Events**: Handle custom events based on topic and message type.

  ```typescript
  client.on('TOPIC_NAME.MESSAGE_TYPE', (message: IncomingMessage, reply: ReplyFunction) => { ... });
  ```

  > Wildcard subscriptions are also supported. See:

## License

This library is licensed under the MIT License.

---

For more detailed examples and advanced configurations, please refer to the [documentation](https://realtime.21no.de/docs).

## Notes

- Ensure that you have an account and an app set up with [Realtime Pub/Sub](https://realtime.21no.de).
- Customize the `urlProvider` function to retrieve the access token for connecting to your realtime application.
- Implement the `getAuthToken` function according to your authentication mechanism.
- Optionally use the `logger` option to integrate with your application's logging system.
- Handle errors and disconnections gracefully to improve the robustness of your application.
- Make sure to handle timeouts when waiting for replies to avoid hanging operations.

---

Feel free to contribute to this project by submitting issues or pull requests on [GitHub](https://github.com/BackendStack21/realtime-pubsub-client).
