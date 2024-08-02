// src/swagger.ts
import { OAS3Options } from 'swagger-jsdoc';

const swaggerOptions: OAS3Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Video API',
      version: '1.0.0',
      description: 'A REST API for video files with authentication, upload, trimming, merging, and sharing functionalities.'
    },
    servers: [
      {
        url: 'http://localhost:3000/api'
      }
    ]
  },
  apis: ['./src/routes/*.ts'] // Path to the API docs
};

export default swaggerOptions;
