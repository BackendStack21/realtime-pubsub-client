import {ConnectionInfo, ReplyFunction} from './../../libs/interfaces'
import {RealtimeClient} from './../../libs'
import {getAuthToken, config} from './../config'

const client = new RealtimeClient({
  websocketOptions: {
    maxRetries: 10,
    urlProvider: async () => {
      const ACCESS_TOKEN = getAuthToken(
        config.WEBSOCKET_CLIENTS_SIGNING_KEY,
        5,
        {
          permissions: [
            'realtime:publisher:write:topic:priv/*',
            'realtime:subscriber:read:topic:secure/inbound',
          ],
        },
        config.ALGORITHM,
      )

      return `wss://${config.CLUSTER_HOSTNAME}/apps/${config.APP_ID}?access_token=${ACCESS_TOKEN}`
    },
  },
})

client.on('session.started', async (info: ConnectionInfo) => {
  client.subscribeRemoteTopic('secure/inbound')
})

client.on('secure/inbound.gettime', async (_, reply: ReplyFunction) => {
  console.log('Responding to gettime request...')

  await reply(new Date().toISOString(), 'ok').waitForAck()
})

client.connect()
