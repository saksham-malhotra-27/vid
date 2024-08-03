import { describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import app from '../'; // Ensure this path points to your Express app initialization
import prisma from '../utils/db'; // Ensure this path is correct
import bcrypt from 'bcrypt';

// Mock the Prisma client
vi.mock('../utils/db', () => {
    return {
      default: {
        user: {
          create: vi.fn().mockImplementation((userData) => {
            if (userData.data.email === 'existing@example.com') {
                 return Promise.reject(new Error('User already exists'));
            }
            return Promise.resolve({
              id: 1,
              email: userData.data.email,
              password: 'hashed_password'
            });
        }),
        findUnique: vi.fn().mockImplementation((findArgs) => {
            if (findArgs.where.email === 'test@example.com') {
              return Promise.resolve({
                id: 1,
                email: 'test@example.com',
                password: 'hashed_password'
              });
            }
        return Promise.resolve(null);
        })
    } }
      }  });
            // Mock bcrypt
vi.mock('bcrypt', () => ({
    hash: vi.fn(() => 'mocked_hashed_password'),
    compare: vi.fn((password, hashed) => Promise.resolve(password === 'password123' && hashed === 'mocked_hashed_password'))
  }));

describe('Authentication routes', () => {
    describe('/api/auth/signup', () => {
      it('should reject invalid email format', async () => {
        const response = await supertest(app)
          .post('/api/auth/signup')
          .send({
            email: 'invalid-email',
            password: 'password1234'
          });
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Validation failed");
      });
  
      it('should reject a password that is too short', async () => {
        const response = await supertest(app)
          .post('/api/auth/signup')
          .send({
            email: 'valid@example.com',
            password: 'short' // Assuming minimum length is 8
          });
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Validation failed");
      });
    });
  
    describe('/api/auth/signin', () => {
      it('should handle validation failures for signin', async () => {
        const response = await supertest(app)
          .post('/api/auth/signin')
          .send({
            email: 'bad-format',
            password: 'password123'
          });
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Validation failed");
      });
    });
  });
  