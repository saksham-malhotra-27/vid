import express, { Router, Request, Response } from 'express';

const router = Router();
import multer from 'multer';
import prisma from '../utils/db';
import { isSignedIn } from '../middlewares/auth';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import ffmpeg from 'fluent-ffmpeg'
import z from 'zod'
import fs from 'fs'

const uploadDir = path.join(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 } 
}).single('video');

const videoSchema = z.object({
  id: z.number()
});

const requestSchema = z.object({
  vids: videoSchema.array()
});


router.post('/upload', isSignedIn, (req: Request, res: Response) => {
  upload(req, res, async (error) => {
    if (error instanceof multer.MulterError) {
      return res.status(500).json({ message: error.message });
    } else if (error) {
      return res.status(500).json({ message: "Failed to upload video." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No video file provided." });
    }

    try {
      
        const video = await prisma.video.create({
            data: {
              filepath: req.file.path,
              userId: req.user.id, // Link the video to the logged-in user
            }
          });
    
          return res.status(201).json({ message: "Video uploaded successfully", videoId: video.id });
        } catch (error) {
          return res.status(500).json({ message: "Database operation failed", error: "Error occured" });
        }
      });
});
    

router.get('/myvideos', isSignedIn, async (req: Request, res: Response) => {
    // Assuming req.user is populated by the isSignedIn middleware with user details including id
    if (!req.user || !req.user.id) {
        return res.status(401).json({ message: "User authentication failed." });
    }

    try {
        const videos = await prisma.video.findMany({
            where: {
                userId: req.user.id
            },
            select: {
                id: true,
                filepath: true,
            }
        });

        res.json({ videos });
    } catch (error) {
        res.status(500).json({ message: "Failed to retrieve videos.", error: "Something Happenned"});
    }
});


router.post('/enable-access/:videoId', isSignedIn, async (req: Request, res: Response) => {
    const { videoId } = req.params;
    const userId = req.user?.id;
  
    const video = await prisma.video.findFirst({
      where: {
        id: parseInt(videoId),
        userId: userId
      }
    });
  
    if (!video) {
      return res.status(404).json({ message: "Video not found or access unauthorized." });
    }
  
    const token = crypto.randomBytes(16).toString('hex');
    // Token valid for 2 hours
    const expiry = new Date(Date.now() + 2 * 60 * 60 * 1000); 
  
    const existingAccess = await prisma.access.findUnique({
        where: { videoId: parseInt(videoId) }
    });

    if (existingAccess) {
        const updatedAccess = await prisma.access.update({
            where: { videoId: parseInt(videoId) },
            data: { token, expiry }
        });
        res.json({ message: "Access updated", token: updatedAccess.token, expiry: updatedAccess.expiry });
    } else {
        const newAccess = await prisma.access.create({
            data: {
                token,
                videoId: parseInt(videoId),
                expiry
            }
        });
        res.json({ message: "Access enabled", token: newAccess.token, expiry: newAccess.expiry });
    }
});

router.get('/access-video/:token', async (req: Request, res: Response) => {
    const { token } = req.params;
  
    const access = await prisma.access.findUnique({
      where: {
        token
      },
      include: {
        video: true
      }
    });
  
    if (!access || access.expiry < new Date()) {
      return res.status(404).json({ message: "Token invalid or expired." });
    }
  
    res.json({ message: "Video access granted.", videoPath: access.video.filepath });
});
  

router.post('/trim-video', isSignedIn, async (req, res) => {
    const { videoId, startTime, endTime } = req.body;
    const userId = req.user?.id;

    const video = await prisma.video.findUnique({
        where: { id: parseInt(videoId), userId: userId }
    });

    if (!video) {
        return res.status(404).json({ message: "Video not found or access unauthorized." });
    }

    const  outputPath = `uploads/trimmed-${Date.now()}-${path.basename(video.filepath)}`;

    ffmpeg(video.filepath)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .output(outputPath)
        .on('end', async () => {
            try {
                const newVideo = await prisma.video.create({
                    data: {
                        filepath: outputPath,
                        userId: userId,
                    }
                });
                res.json({ message: "Video trimmed successfully", videoId: newVideo.id, outputPath });
            } catch (error) {
                res.status(500).json({ message: "Failed to save the video info to the database", error: "Failed to deliver" });
            }
        })
        .on('error', (err) => {
            res.status(500).json({ message: "Failed to trim video", error: err.message });
        })
        .run();
});


router.post('/merge-videos', express.raw({ type: '*/*', limit: '2mb' }), isSignedIn, async (req: Request, res: Response) => {
  const  str = req.body.toString('utf-8');
  const  jsonStr = JSON.parse(str);
  const  result = requestSchema.safeParse(jsonStr);
  if (!result.success) {
      return res.status(400).json({ message: "Invalid data provided.", error: result.error });
  }

  const videoObjects = result.data.vids;
  const userId = req.user?.id; 
  const videoIds = videoObjects.map(v => v.id);

  const videos = await prisma.video.findMany({
      where: { id: { in: videoIds }, userId: userId }
  });

  if (videos.length !== videoIds.length) {
      return res.status(404).json({ message: "One or more videos not found or access unauthorized." });
  }

  
  let totalSize = 0;
  for (const video of videos) {
      try {
          const stats = fs.statSync(video.filepath);
          totalSize += stats.size;
      } catch (error) {
          return res.status(500).json({ message: "Failed to access video file.", error: String(error) });
      }
  }

  if (totalSize > 25 * 1024 * 1024) { // 25 MB limit
      return res.status(413).json({ message: "Total video size exceeds the permitted limit of 25 MB." });
  }

  // Create a temporary file to list all video paths
  const tempDir = path.join(__dirname, '../../location');
  if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
  }
  const listFilePath = path.join(tempDir, `list-${Date.now()}.txt`);
  const fileContent = videos.map(video => `file '${video.filepath}'`).join('\n');
  fs.writeFileSync(listFilePath, fileContent);

  // Path for the output merged video
  const outputFilePath = path.join(__dirname, `../../uploads/merged-${Date.now()}.mp4`);

  // Execute ffmpeg to merge videos
  const command = `ffmpeg -safe 0 -f concat -i "${listFilePath}" -c copy "${outputFilePath}"`;
  exec(command, async (error, stdout, stderr) => {
      // Delete the temporary file regardless of the ffmpeg command result
      fs.unlink(listFilePath, async (unlinkErr) => {
          if (unlinkErr) {
              console.error('Error deleting the temporary list file:', unlinkErr.message);
          }

          if (error) {
              return res.status(500).json({ message: "Failed to merge videos", error: String(error)});
          }

          
          try {
              const newVideo = await prisma.video.create({
                  data: {
                      filepath: outputFilePath,
                      userId: userId,
                  }
              });
              res.json({ message: "Videos merged successfully", videoId: newVideo.id, outputPath: outputFilePath });
          } catch (dbError) {
              res.status(500).json({ message: "Database operation failed", error: String(error) });
          }
      });
  });
});




export default router

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */
/**
 * @swagger
 * /videos/upload:
 *   post:
 *     summary: Upload a video
 *     description: Allows users to upload a video file. Requires user to be signed in.
 *     tags: [Video Management]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *                 description: Video file to upload
 *     responses:
 *       201:
 *         description: Video uploaded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 videoId:
 *                   type: integer
 *       400:
 *         description: No video file provided.
 *       500:
 *         description: Failed to upload video or database operation failed.
 *     security:
 *       - bearerAuth: []
 */

/**
 * @swagger
 * /videos/myvideos:
 *   get:
 *     summary: List all videos of a user
 *     description: Retrieves all video files uploaded by the signed-in user.
 *     tags: [Video Management]
 *     responses:
 *       200:
 *         description: Successfully retrieved videos.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 videos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       filepath:
 *                         type: string
 *       401:
 *         description: User authentication failed.
 *       500:
 *         description: Failed to retrieve videos.
 *     security:
 *       - bearerAuth: []
 */

/**
 * @swagger
 * /videos/enable-access/{videoId}:
 *   post:
 *     summary: Enable or update access to a video
 *     description: Grants or updates access to a specified video by generating a new access token.
 *     tags: [Video Management]
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the video for which access is being enabled or updated
 *     responses:
 *       200:
 *         description: Access enabled or updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 expiry:
 *                   type: string
 *       404:
 *         description: Video not found or access unauthorized.
 *       500:
 *         description: Failed to enable or update access.
 *     security:
 *       - bearerAuth: []
 */

/**
 * @swagger
 * /videos/access-video/{token}:
 *   get:
 *     summary: Access a video by token
 *     description: Retrieves the path of a video that is accessed using a valid token.
 *     tags: [Video Management]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The access token for the video
 *     responses:
 *       200:
 *         description: Video access granted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 videoPath:
 *                   type: string
 */

/**
 * @swagger
 * /videos/trim-video:
 *   post:
 *     summary: Trim a video
 *     description: Trims a video between specified start and end times.
 *     tags: [Video Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               videoId:
 *                 type: integer
 *               startTime:
 *                 type: string
 *               endTime:
 *                 type: string
 *     responses:
 *       200:
 *         description: Video trimmed successfully.
 *       404:
 *         description: Video not found or access unauthorized.
 *       500:
 *         description: Failed to trim video.
 *     security:
 *       - bearerAuth: []
 */

/**
 * @swagger
 * /videos/merge-videos:
 *   post:
 *     summary: Merge multiple videos
 *     description: Merges multiple videos into one. Requires all video IDs to belong to the user and total size under 25 MB.
 *     tags: [Video Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vids:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Videos merged successfully.
 *       404:
 *         description: One or more videos not found or access unauthorized.
 *       413:
 *         description: Total video size exceeds the permitted limit.
 *       500:
 *         description: Failed to merge videos or failed to access video file.
 *     security:
 *       - bearerAuth: []
 */
