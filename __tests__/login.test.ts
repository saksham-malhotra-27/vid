import { PrismaClient, User, Prisma } from '@prisma/client';
import { describe, it, expect, jest } from '@jest/globals';
import supertest from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../src/'; 

jest.mock('bcrypt', () => ({
  hash: jest.fn(() => Promise.resolve('mocked_hashed_password')),
  compare: jest.fn((password, hash) => Promise.resolve(password === 'password123' && hash === 'mocked_hashed_password')),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock_jwt_token'),
}));

// Mock Prisma client
jest.mock('@prisma/client', () => {
    const mUser = {
      create: jest.fn(),
      findUnique: jest.fn(),
    };
  
    mUser.create.mockImplementation(() => Promise.resolve({
      id: 1,
      email: 'test@example.com',
      password: 'mocked_hashed_password',
    }));
  
    mUser.findUnique.mockImplementation((args: any) => {
      if (args.where?.email === 'test@example.com') {
        return Promise.resolve({
          email: 'test@example.com',
          password: 'mocked_hashed_password',
        });
      }
      return Promise.resolve(null);
    });
  
    return {
      PrismaClient: jest.fn().mockImplementation(() => ({
        user: mUser,
      })),
    };
  });

describe('Authentication routes', () => {
  describe('/api/auth/signup', () => {
    it('should validate and create a user with valid credentials', async () => {
      const response = await supertest(app)
        .post('/api/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'password1234',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("User created successfully");
      expect(response.body.data.token).toBeDefined();
    });

    it('should reject invalid email format', async () => {
      const response = await supertest(app)
        .post('/api/auth/signup')
        .send({
          email: 'invalid-email',
          password: 'password1234',
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
          password: 'short',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Validation failed");
    });

    it('should register a user', async()=>{
        const response = await supertest(app)
        .post('/api/auth/signup')
        .send({
            email:'valid@example.com',
            password:"correctonepass",
        })

        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
    })
  });

  describe('/api/auth/signin', () => {
    it('should authenticate a user with correct credentials', async () => {
      const response = await supertest(app)
        .post('/api/auth/signin')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Login successful");
      expect(response.body.data.token).toBe('bearer mock_jwt_token');
    });

    it('should handle validation failures for signin', async () => {
      const response = await supertest(app)
        .post('/api/auth/signin')
        .send({
          email: 'bad-format',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Validation failed");
    });
  });
});


