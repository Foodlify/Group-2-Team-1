import request from 'supertest';
import { describe, it, expect } from '@jest/globals';
import app from '../src/app';

describe('Health Check API', () => {
  it('should return a 200 OK and confirm DB connection', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'success');
  });
});
