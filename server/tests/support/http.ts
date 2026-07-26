import supertest, { type Test } from 'supertest';
import { createApp } from '../../src/app.js';

export const createHttpAgent = () => supertest.agent(createApp());

export const asToken = (request: Test, token: string): Test =>
  request.set('Authorization', `Bearer ${token}`);
