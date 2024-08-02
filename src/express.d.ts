import { File } from 'multer';
declare module 'express-serve-static-core' {
  interface Request {
    user?: any;
  }
}
