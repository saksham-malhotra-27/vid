import { describe, it, expect, jest } from '@jest/globals';
import supertest from 'supertest';
import app from '../src/'; // Adjust the import path to where your Express app is initialized
import { PrismaClient, User } from '@prisma/client';
import express, { Request, Response, NextFunction } from 'express';
import { Readable } from 'stream';

let fakeFile = true;
let simulateError = false;
let simulateUser = true;


interface FfmpegCommand {
  setStartTime: (startTime: string) => FfmpegCommand;
  setDuration: (duration: number) => FfmpegCommand;
  output: (outputPath: string) => FfmpegCommand;
  on: (event: string, callback: (error?: Error, data?: string) => void) => FfmpegCommand;
  run: () => FfmpegCommand;
}



declare global {
  namespace Express {
    interface Request {
      user?: User;
      file?: Express.Multer.File;
    }
  }
}



jest.mock('../src/middlewares/auth', () => ({
  isSignedIn: (req: Request, res: Response, next: NextFunction) => {
    if(simulateUser){
    req.user = { id: 1, email: "saksh@gmail.com", password: "asdfghjk" };
    next();}
    else{
      return res.status(401).json({message:"No token provided, authorization denied."})
    }
  }
}));

jest.mock('@prisma/client', () => {
  const mVideo = {
    create: jest.fn().mockImplementation(()=>Promise.resolve({
      id: 1,
      userId : 1,
      filepath : "dummy",
    })),
    findMany: jest.fn().mockImplementation(() => {
      if(!simulateError){
      return ([
        { id: 1, filepath: 'path/to/video1.mp4' },
        { id: 2, filepath: 'path/to/video2.mp4' },
        
        ] )} 
      else {
          return null 
        }
    }
    ),
    findFirst: jest.fn().mockImplementation((params: any) => {
      if(simulateError){return null;}
      if (params.where.id === 1 && params.where.userId === 1) {
        return { id: 1, userId: 1, filepath: 'path/to/video.mp4' };
      }
      return null;
    }),
    findUnique: jest.fn().mockImplementation((params: any) => {
      if (params.where.id === 1) {
        return { id: 1, userId: 1, filepath: 'path/to/video.mp4' };
      }
      return null;
    }),
    update: jest.fn()
  };

  const mAccess = {
    findUnique: jest.fn().mockImplementation((params: any) => {
      if (params.where.token === 'dummy_token') {
        if(simulateError){
          return {
            token: 'dummy_token',
            video: { filepath: 'path/to/video.mp4' },
            expiry: new Date(Date.now() - 2 * 60 * 60 * 1000)
          };
        }
        else 
        return {
          token: 'dummy_token',
          video: { filepath: 'path/to/video.mp4' },
          expiry: new Date(Date.now() + 2 * 60 * 60 * 1000)
        };
      }
      return null;
    }),
    create: jest.fn().mockImplementation(() => ({
      token: 'dummy_token',
      videoId: 1,
      expiry: new Date(Date.now() + 2 * 60 * 60 * 1000)
    })),
    update: jest.fn()
  };

  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      video: mVideo,
      access: mAccess
    })),
  };
});

const prisma = new PrismaClient();

jest.mock('multer', () => {
  const multer = jest.fn(() => ({
    single: jest.fn(() => (req: Request, res: Response, next: NextFunction) => {
      if (!fakeFile) {
        next();
      } else {
        const mockStream = new Readable();
        mockStream.push('fake file content'); 
        mockStream.push(null);

        req.file = {
          fieldname: 'video',
          originalname: 'testvideo.mp4',
          encoding: '7bit',
          mimetype: 'video/mp4',
          size: 1024,
          destination: 'uploads/',
          filename: 'testvideo.mp4',
          path: 'uploads/testvideo.mp4',
          stream: mockStream,
          buffer: Buffer.from(''), // Assuming you don't need to simulate actual file content here
        };
        next();
      }
    }),
  }));

  class MulterError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'MulterError';
    }
  }

  (multer as any).diskStorage = jest.fn(() => ({
    _handleFile: jest.fn((req: Request, file: Express.Multer.File, cb: (error: Error | null, info?: Partial<Express.Multer.File>) => void) => {
      cb(null, {
        destination: 'uploads/',
        filename: 'testvideo.mp4',
        path: 'uploads/testvideo.mp4',
        size: 1024,
      });
    }),
    _removeFile: jest.fn((req: Request, file: Express.Multer.File, cb: (error: Error | null) => void) => {
      cb(null);
    }),
  }));

  (multer as any).MulterError = MulterError;

  return multer;
});


jest.mock('fluent-ffmpeg', () => {
  const mock: jest.Mocked<FfmpegCommand> = {
    setStartTime: jest.fn<() => FfmpegCommand>().mockReturnThis(),
    setDuration: jest.fn<() => FfmpegCommand>().mockReturnThis(),
    output: jest.fn<() => FfmpegCommand>().mockReturnThis(),
    on: jest.fn<(event: string, callback: (error?: Error, data?: string) => void) => FfmpegCommand>()
      .mockImplementation(function(this: FfmpegCommand, event, callback) {
        if (event === 'end') {
          setTimeout(() => callback(undefined, 'Success'), 100);
        } else if (event === 'error') {
          setTimeout(() => callback(new Error('Trimming failed')), 100);
        }
        return this;
      }),
    run: jest.fn<() => FfmpegCommand>().mockReturnThis(),
  };

  return jest.fn(() => mock);
});


describe('Video Management', () => {
  describe('POST /api/videos/upload', () => {
    it('should upload a video and save record', async () => {
      fakeFile = true;
      const response = await supertest(app)
        .post('/api/videos/upload')
        .attach('video', Buffer.from('test video data'), 'testvideo.mp4');

      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Video uploaded successfully");
      expect(prisma.video.create).toHaveBeenCalled();
      expect(response.body.videoId).toBeDefined();
    });

    it('should handle file upload errors', async () => {
      fakeFile = false;
      const response = await supertest(app)
        .post('/api/videos/upload')
        .set('Authorization', 'Bearer dummy_token');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("No video file provided.");
    });

    it('should handle invalid user', async () => {
      fakeFile = false;
      simulateUser=false
      const response = await supertest(app)
        .post('/api/videos/upload')

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("No token provided, authorization denied.");
      simulateUser=true;
    });

  });

  describe('GET /api/videos/myvideos', () => {
    it('should retrieve all videos for a user', async () => {
      simulateError=false;
      const response = await supertest(app)
        .get('/api/videos/myvideos')
        .set('Authorization', 'Bearer dummy_token');

      expect(response.status).toBe(200);
    });

    it('should handle errors when retrieving videos', async () => {
      simulateError=true; 
      const response = await supertest(app)
        .get('/api/videos/myvideos')
        .set('Authorization', 'Bearer dummy_token');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('No Such Videos');
    });
  });

  describe('POST /api/videos/enable-access/:videoId', () => {
    it('should enable access to a video', async () => {
      simulateError = false;
      const response = await supertest(app)
        .post('/api/videos/enable-access/1')
        .set('Authorization', 'Bearer dummy_token');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Access enabled');
      expect(response.body.token).toBeDefined();
      expect(prisma.access.create).toHaveBeenCalled();
    });

    it('should handle errors when enabling access', async () => {
      simulateError = true;
      const response = await supertest(app)
        .post('/api/videos/enable-access/1')
        .set('Authorization', 'Bearer dummy_token');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Video not found or access unauthorized.');
    });
  });

  describe('GET /api/videos/access-video/:token', () => {
    it('should grant access to a video with a valid token', async () => {
      simulateError=false;
      const response = await supertest(app)
        .get('/api/videos/access-video/dummy_token')
        .set('Authorization', 'Bearer dummy_token');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Video access granted.');
      expect(response.body.videoPath).toBe('path/to/video.mp4');
    });

    it('should handle invalid or expired tokens', async () => {
      simulateError=true;
      const response = await supertest(app)
        .get('/api/videos/access-video/dummy_token')
        .set('Authorization', 'Bearer dummy_token');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Token invalid or expired.');
    });
  });

  describe('POST /api/videos/trim-video', () => {
    it('should trim a video', async () => {
      simulateError=false;
      const response = await supertest(app)
        .post('/api/videos/trim-video')
        .set('Authorization', 'Bearer dummy_token')
        .send({
          videoId: "1", 
          startTime: "1", 
          endTime: "5",
        });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Video trimmed successfully');
     
    });

    it('should handle invalid videos', async () => {
      simulateError=true;
      const response = await supertest(app)
        .post('/api/videos/trim-video')
        .set('Authorization', 'Bearer dummy_token')
        .send({

        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid video ID provided.');
    });
  });
  
  describe('POST /merge-videos', () => {

    it('should merge videos successfully', async () => {
        simulateError=false;
        const videoData = { vids: [{ id: 1 }, { id: 2 }] };
        const response = await supertest(app)
        .post('/api/videos/merge-videos')
        .set('Authorization', 'Bearer dummy_token')
        .set('Content-Type', 'application/json')  
        .send({ vids: [{ id: 1 }, { id: 2 }] });
  
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Videos merged successfully');
    });
  
    it('should return an error if one or more videos are not found', async () => {
      
      simulateError=true;
      const response = await supertest(app)
        .post('/api/videos/merge-videos')
        .set('Authorization', 'Bearer dummy_token')
        .set('Content-Type', 'application/json')  
        .send({ vids: [{ id: 999 }] });
  
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('One or more videos not found or access unauthorized.');
    });
  
    it('should reject the request if the videos are not present', async () => {
      simulateError=true;
      const response = await supertest(app)
        .post('/api/videos/merge-videos')
        .set('Authorization', 'Bearer dummy_token')
        .set('Content-Type', 'application/json')  
        .send({ vids: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('One or more videos not found or access unauthorized.');
    });
  });
  
});
