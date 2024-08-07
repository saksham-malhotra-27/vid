import express, { Request, Response } from 'express';
import prisma from '../utils/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import z from 'zod'
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'abcdef';

const signupSchema = z.object({
    email: z.string().email({ message: "Invalid email format" }),
    password: z.string().min(8, { message: "Password must be at least 8 characters long" })
});

const signinSchema = z.object({
    email: z.string().email({ message: "Invalid email format" }),
    password: z.string()
});

async function hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

async function validatePassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
}


router.post('/signup', async (req: Request, res: Response) => {
    try {
        const validatedData = signupSchema.parse(req.body);
        const hashedPassword = await hashPassword(validatedData.password);
        const user = await prisma.user.create({
            data: {
                email: validatedData.email,
                password: hashedPassword
            }
        });
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        res.status(201).json({ success: true, message: "User created successfully", data: { token: `bearer ${token}` }});
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.errors });
        }
        console.error("Signup error:", error);
        res.status(500).json({ success: false, message: "Error creating user", error: String(error) });
    }
});

router.post('/signin', async (req: Request, res: Response) => {
    try {
        const validatedData = signinSchema.parse(req.body);
        const user = await prisma.user.findUnique({
            where: {
                email: validatedData.email
            }
        });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const isValid = await validatePassword(validatedData.password, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ success: true, message: "Login successful", data: { token: `bearer ${token}` } });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.errors });
        }
        console.error("Signin error:", error);
        res.status(500).json({ success: false, message: "Error signing in", error: String(error) });
    }
});



/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account and returns a JWT token.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       201:
 *         description: User created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *       400:
 *         description: Error creating user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 error:
 *                   type: object
 *                   properties:
 *                     details:
 *                       type: string
 *       500:
 *         description: Server error.
 */

/**
 * @swagger
 * /auth/signin:
 *   post:
 *     summary: Authenticate a user
 *     description: Validates user credentials and returns a JWT token if successful.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *       401:
 *         description: Invalid credentials.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 error:
 *                   type: object
 *                   properties:
 *                     details:
 *                       type: string
 */




export default router;


