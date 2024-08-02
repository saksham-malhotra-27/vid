import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/db';

const JWT_SECRET = process.env.JWT_SECRET || 'abcdef';

interface JwtPayload {
    userId: number;
    email: string;
}

export function isSignedIn(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ msg: "No token provided, authorization denied." });
    }

    const token = authHeader.split(' ')[1]; // Extract the token part after 'Bearer '


    try {
        jwt.verify(token, JWT_SECRET, async (err, decoded)=>{
            if (err || !decoded) {
                return res.status(403).json({msg:'Token not verified'});
              }
              const userPayload = decoded as JwtPayload;

              const user = await prisma.user.findUnique({
                where: { id: userPayload.userId }
              });

              if (!user) {
                return res.status(404).json({ msg: 'User not found' });
            }

            req.user = user;

            next();


        });
        
    } catch (error) {
        res.status(401).json({ message: "Token is not valid." });
    }
}
