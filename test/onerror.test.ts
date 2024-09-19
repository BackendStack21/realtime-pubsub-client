import assert from 'assert/strict'
import {
  ConnectionInfo,
  IncomingMessage,
  RealtimeClient,
  ReplyFunction,
} from '../libs'
import {describe, it} from 'node:test'
import {config, getAuthToken} from './config'
import {WaitForOptions} from 'eventemitter2'

describe('OnError Suite', () => {
  let client1: RealtimeClient

  it('should close connection on missing permissions (maxRetries=0)', async () => {
    client1 = new RealtimeClient({
      websocketOptions: {
        maxRetries: 0,
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

    client1.on('session.started', (connection: ConnectionInfo) => {
      // always subscribe topics here
      client1.subscribeRemoteTopic('secure/tasks')
    })

    await client1.connect()
    const [event] = await client1.waitFor('close', {
      timeout: 1000,
    } as WaitForOptions)

    assert.equal(
      (event as CloseEvent).reason,
      'Subscription to secure topic is forbidden!',
    )
  })
})
