import {IncomingMessage, ReplyFunction, ResponseMessage} from 'libs/interfaces'
import {RealtimeClient} from '../libs'
import {getAuthToken, config} from './config'

const client = new RealtimeClient({
  websocketOptions: {
    maxRetries: 10,
    urlProvider: async () => {
      const ACCESS_TOKEN = getAuthToken(
        config.WEBSOCKET_CLIENTS_SIGNING_KEY,
        5,
        {
          permissions: [
            'realtime:publisher:write:topic:*',
            'realtime:subscriber:read:topic:*',
          ],
        },
        config.ALGORITHM,
      )

      return `wss://${config.CLUSTER_HOSTNAME}/apps/${config.APP_ID}?access_token=${ACCESS_TOKEN}`
    },
  },
})

const TOPIC = 'my-topic'

// Subscribe to the topic using TOPIC.MESSAGE_TYPE
client.on(
  TOPIC + '.greeting',
  async (message: IncomingMessage, reply: ReplyFunction) => {
    console.log(`Received message on "${TOPIC}":`, message)
    console.log('Replying to the message...')

    await reply(null, 'ok').waitForAck()
  },
)

// Subscribe to the presence protocol events
client.on('secure/inbound.presence', async (message: IncomingMessage) => {
  console.log(`Received event:`, message)
})

client.on('error', (err) => {
  console.error('Error:', err)
})

client.on('close', (event) => {
  console.log('Connection closed', event)
})

// Connect to the WebSocket server
client.connect().then(async (info) => {
  console.log('Connected to Realtime Pub/Sub', info)

  // Subscribe to the topic
  client.subscribeRemoteTopic(TOPIC)
  // Publish a message to the topic

  console.log(`Publishing on ${TOPIC}...`)
  await client
    .publish(TOPIC, 'Hello, Realtime Pub/Sub!', {
      messageType: 'greeting',
    })
    .waitForAck()

  const [res] = await client
    .publish(TOPIC, 'Hello, Realtime Pub/Sub!', {
      messageType: 'greeting',
    })
    .waitForReply()

  console.log('Received response:', res as ResponseMessage)

  client
    .send('Hello, Realtime Pub/Sub!')
    .waitForReply()
    .catch((err) => {
      console.error('Error:', err) // like: timeout
    })
})
