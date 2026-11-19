/**
 * Base OpenAPI document. Each module contributes its own paths in later phases
 * (merged here), so documentation stays next to the code that implements it.
 */
const json = (example: unknown) => ({
  required: true,
  content: { 'application/json': { schema: { type: 'object' }, example } },
});
const err = (code: string) => ({
  description: code,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code, message: '...' } } } },
});
const authExample = {
  'application/json': {
    example: {
      user: { id: '3f2b8a52-1c4d-4f64-9d5e-0a1b2c3d4e5f', fullName: 'Ahmed Ali', phone: '+249912345678', email: null, role: 'customer', status: 'active', preferredLanguage: 'ar' },
      accessToken: '<jwt>',
      refreshToken: '<opaque>',
      expiresIn: 900,
    },
  },
};

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Humasiyat API',
    version: '0.1.0',
    description: 'Football pitch booking platform API (customers, managers, super admins).',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'SLOT_TAKEN' },
              message: { type: 'string' },
              details: {},
            },
          },
        },
      },
    },
  },
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create a customer account (phone and/or email) and start a session',
        requestBody: json({ fullName: 'Ahmed Ali', phone: '0912345678', email: 'ahmed@example.com', password: 'Secret123', preferredLanguage: 'ar' }),
        responses: { 201: { description: 'Session', content: authExample }, 409: err('ACCOUNT_EXISTS'), 422: err('VALIDATION_ERROR') },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in with a phone number or email',
        requestBody: json({ identifier: '0912345678', password: 'Secret123' }),
        responses: { 200: { description: 'Session', content: authExample }, 401: err('INVALID_CREDENTIALS'), 403: err('ACCOUNT_INACTIVE') },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate the refresh token and get a new access token (reuse revokes the session family)',
        requestBody: json({ refreshToken: '<refresh token>' }),
        responses: { 200: { description: 'New tokens' }, 401: err('INVALID_REFRESH_TOKEN'), 403: err('ACCOUNT_INACTIVE') },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke the session of this refresh token (idempotent)',
        requestBody: json({ refreshToken: '<refresh token>' }),
        responses: { 204: { description: 'Signed out' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request a reset token. Always answers 200, whether or not the account exists',
        requestBody: json({ identifier: '0912345678' }),
        responses: { 200: { description: 'Generic confirmation' } },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Set a new password with a reset token (single use; signs out every device)',
        requestBody: json({ token: '<reset token>', newPassword: 'Brandnew99' }),
        responses: { 204: { description: 'Password changed' }, 400: err('INVALID_RESET_TOKEN') },
      },
    },
    '/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: 'Change the password; other sessions are revoked and fresh tokens returned',
        security: [{ bearerAuth: [] }],
        requestBody: json({ currentPassword: 'Secret123', newPassword: 'Newpass123' }),
        responses: { 200: { description: 'New tokens' }, 400: err('INVALID_CURRENT_PASSWORD'), 401: err('UNAUTHORIZED') },
      },
    },
    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'The signed-in user (role and status come from the database)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'User' }, 401: err('UNAUTHORIZED') },
      },
    },
    '/admin/users/{id}/status': {
      patch: {
        tags: ['Admin'],
        summary: 'Suspend (reason required) or reactivate a user. Super admin only',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: json({ status: 'suspended', reason: 'Fake payment screenshots' }),
        responses: { 200: { description: 'Updated user' }, 403: err('FORBIDDEN'), 404: err('NOT_FOUND') },
      },
    },
  },
};
