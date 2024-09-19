import assert from 'assert/strict'
import {
  ConnectionInfo,
  IncomingMessage,
  RealtimeClient,
  ReplyFunction,
} from '../libs'
import {describe, it} from 'node:test'
import {config, getAuthToken} from './config'

describe('Smoke Suite', () => {
  let server: RealtimeClient
  let client1: RealtimeClient
  let serverConnectionInfo: ConnectionInfo
  let clientConnectionInfo: ConnectionInfo

  let clientMessages: IncomingMessage[] = []

  it('creating server connection', async () => {
    server = new RealtimeClient({
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

    server.on('session.started', (connection: ConnectionInfo) => {
      serverConnectionInfo = connection

      // always subscribe topics here
      server.subscribeRemoteTopic('clock')
      server.subscribeRemoteTopic('secure/inbound')
    })

    await server.connect()
    await server.waitFor('session.started')

    assert.notEqual(serverConnectionInfo.id, null)
  })

  it('creating client1 connection', async () => {
    client1 = new RealtimeClient({
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

    client1.on('session.started', (connection: ConnectionInfo) => {
      clientConnectionInfo = connection

      // always subscribe topics here
      client1.subscribeRemoteTopic('notifications')
    })
    await client1.connect()
    await client1.waitFor('session.started')

    assert.notEqual(clientConnectionInfo.id, null)
  })

  it('subscribing client to notifications events', () => {
    client1.on('notifications.firmware-update', (message: IncomingMessage) => {
      clientMessages.push(message)
    })
  })

  it('subscribing "gettime" event handler', () => {
    server.on(
      'clock.gettime',
      async (message: IncomingMessage, reply: ReplyFunction) => {
        reply(
          {
            time: new Date().getTime(),
          },
          'ok',
        )
      },
    )
  })

  it('subscribing "firmware-updated" event handler', async () => {
    server.on(
      'secure/inbound.firmware-updated',
      async (message: IncomingMessage, reply: ReplyFunction) => {
        assert.equal(message.compression, true)

        reply('Great!', 'ok')
      },
    )
  })

  it('requesting "gettime" from client', async () => {
    const [res] = await client1
      .publish('clock', '', {
        messageType: 'gettime',
      })
      .waitForReply()

    assert.notEqual(res, null)
    assert.equal(res.status, 'ok')
    assert.equal(typeof res.data.time === 'number', true)
  })

  it('requesting "gettime" from client 10 times', async () => {
    for (let i = 0; i < 10; i++) {
      const [res] = await client1
        .publish('clock', '', {
          messageType: 'gettime',
        })
        .waitForReply()

      assert.notEqual(res, null)
      assert.equal(res.status, 'ok')
      assert.equal(typeof res.data.time === 'number', true)
    }
  })

  it('publishing notification from server', async () => {
    await server
      .publish('notifications', 'Firmware update available', {
        messageType: 'firmware-update',
      })
      .waitForAck()

    // wait 100ms for message to be received
    await client1.wait(100)
  })

  it('client received notification', async () => {
    assert.equal(clientMessages.length, 1)
    assert.equal(clientMessages[0].data.payload, 'Firmware update available')
  })

  it('sending a message to the server (firmware-updated)', async () => {
    const [res] = await client1
      .send('Done!', {
        messageType: 'firmware-updated',
        compress: true,
      })
      .waitForReply()

    assert.notEqual(res, null)
    assert.equal(res.status, 'ok')
    assert.equal(res.data, 'Great!')
  })

  it('wait for ack on server received by server (publish)', async () => {
    await client1
      .publish('notifications', 'Space 80%', {
        messageType: 'storage',
      })
      .waitForAck()
  })

  it('wait for ack on server received by server (send)', async () => {
    await client1
      .send('A task', {
        messageType: 'create-task',
      })
      .waitForAck()
  })

  it('wait for ack on server received by server', async () => {
    await server
      .publish('notifications', 'Space 80%', {
        messageType: 'storage',
      })
      .waitForAck()
  })

  it('should timeout on waitForReply (publish)', async () => {
    try {
      await server
        .publish('notifications', 'Space 80%', {
          messageType: 'storage',
        })
        .waitForReply(100)
    } catch (error) {
      assert.equal(error.message, 'timeout')
    }
  })

  it('should timeout on waitForReply (send)', async () => {
    try {
      await client1
        .send('A task', {
          messageType: 'create-task',
        })
        .waitForReply(100)
    } catch (error) {
      assert.equal(error.message, 'timeout')
    }
  })

  it('disconnecting connection 1', async () => {
    server.disconnect()
  })

  it('disconnecting connection 2', async () => {
    client1.disconnect()
  })
})
