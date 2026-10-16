import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../../shared/errors.js';
export function createGoogleProvider(config) {
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.callbackUrl);
  return {
    authorizationUrl({ state, challenge, nonce }) {
      return client.generateAuthUrl({
        scope: ['openid', 'email', 'profile'],
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
    },
    async exchange(code, verifier, nonce) {
      const { tokens } = await client.getToken({ code, codeVerifier: verifier });
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.clientId,
      });
      const profile = ticket.getPayload();
      if (!profile || profile.nonce !== nonce)
        throw new AppError(401, 'INVALID_IDENTITY', 'Could not verify your Google identity.');
      return profile;
    },
  };
}
