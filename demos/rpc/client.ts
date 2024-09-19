import {ConnectionInfo, ResponseMessage} from '../../libs/interfaces'
import {RealtimeClient} from '../../libs'
import {getAuthToken, config} from './../config'

const client = new RealtimeClient({
  websocketOptions: {
    maxRetries: 10,
    urlProvider: async () => {
      const ACCESS_TOKEN = getAuthToken(
        config.WEBSOCKET_CLIENTS_SIGNING_KEY,
        5,
        {
          permissions: [],
        },
        config.ALGORITHM,
      )

      return `wss://${config.CLUSTER_HOSTNAME}/apps/${config.APP_ID}?access_token=${ACCESS_TOKEN}`
    },
  },
})

client.on('session.started', async (info: ConnectionInfo) => {
  // request time to server
  const [res] = await client
    .send('', {
      messageType: 'gettime',
    })
    .waitForReply()

  console.log('Server Time:', res as ResponseMessage)

  client.disconnect()
})

client.connect()
