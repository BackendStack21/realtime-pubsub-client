import jwt from 'jsonwebtoken'

// Function to generate an access token
const getAuthToken = (
  signingKey: string,
  expiresInSeconds: number,
  payload: object,
  algorithm: string,
): string => {
  return jwt.sign(payload, signingKey, {
    algorithm,
    expiresIn: expiresInSeconds,
    subject: Math.random().toString(36).substring(7),
  })
}

const config = {
  APP_ID: process.env.APP_ID,
  WEBSOCKET_CLIENTS_SIGNING_KEY: process.env.WEBSOCKET_CLIENTS_SIGNING_KEY,
  ALGORITHM: process.env.ALGORITHM,
  CLUSTER_HOSTNAME: 'genesis.r7.21no.de',
}

export {getAuthToken, config}
