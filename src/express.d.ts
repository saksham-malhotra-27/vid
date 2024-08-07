import { File } from 'multer';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      file?: Express.Multer.File;
    }
  }
}