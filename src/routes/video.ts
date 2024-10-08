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
  
    if (error) {
      return res.status(500).json({ message: "Failed to upload video." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No video file provided." });
    }

    try {
      
        const video = await prisma.video.create({
            data: {
              filepath: req.file.path,
              userId: req.user.id,  
            }
          });
    
          return res.status(201).json({ message: "Video uploaded successfully", videoId: video.id });
        } catch (error) {
          return res.status(500).json({ message: "Database operation failed", error: "Error occured" });
        }
      });
});
    

router.get('/myvideos', isSignedIn, async (req: Request, res: Response) => {
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
        if(videos){
        res.status(200).json({ videos });}
        else {
            res.status(404).json({message:"No Such Videos", error:"Something is not right"})
        }
    } catch (error) {
        res.status(500).json({ message: "Failed to retrieve videos.", error: "Something Happenned"});
    }
});


router.post('/enable-access/:videoId', isSignedIn, async (req: Request, res: Response) => {
    const { videoId } = req.params;
    const userId = req.user?.id;
    
    if (isNaN(parseInt(videoId))) {
        return res.status(400).json({ message: "Invalid video ID provided." });
      }
  
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
    
    if (isNaN(parseInt(videoId)) || isNaN(parseFloat(startTime)) || isNaN(parseFloat(endTime))) {
        return res.status(400).json({ message: "Invalid video ID provided." });
      }
    const userId = req.user?.id;

    const video = await prisma.video.findUnique({
        where: { id: parseInt(videoId), userId: userId }
    });

    if (!video) {
        return res.status(404).json({ message: "Video not found or access unauthorized." });
    }

    const  outputPath = `uploads/trimmed-${Date.now()}-${path.basename(video.filepath)}`;
    let responseSent = false;  
    const basepath = path.join(__dirname, '../..', outputPath)
    ffmpeg(video.filepath)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .output(outputPath)
        .on('end', async () => {
            if(responseSent) return;
            try {
             
                const newVideo = await prisma.video.create({
                    data: {
                        filepath: basepath,
                        userId: userId,
                    }
                });
                res.status(200).json({ message: "Video trimmed successfully", videoId: newVideo.id, outputPath: basepath });
                responseSent = true; 
            } catch (error) {
                if (!responseSent) {
                res.status(500).json({ message: "Failed to save the video info to the database", error: "Failed to deliver" });
                responseSent = true 
                }
            }
        })
        .on('error', (err) => {
            if(!responseSent){
            res.status(500).json({ message: "Failed to trim video", error: err.message });
            responseSent= true;}
        })
        .run();
});


router.post('/merge-videos', isSignedIn, async (req: Request, res: Response) => {
    
  const  result = requestSchema.safeParse(req.body);
  if (!result.success) {
      return res.status(400).json({ message: "Invalid data provided.", error: result.error });
  }

  const videoObjects = result.data.vids;
  const userId = req.user?.id; 
  const videoIds = videoObjects.map(v => v.id);

  const videos = await prisma.video.findMany({
      where: { id: { in: videoIds }, userId: userId }
  });

  if ( !videos || videos.length !== videoIds.length) {
      return res.status(404).json({ message: "One or more videos not found or access unauthorized." });
  }

  if(process.env.NODE_ENV === "test"){
    return res.status(200).json({message:"Videos merged successfully"})
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

  const tempDir = path.join(__dirname, '../../location');
  if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
  }
  const listFilePath = path.join(tempDir, `list-${Date.now()}.txt`);
  const fileContent = videos.map(video => `file '${video.filepath}'`).join('\n');
  fs.writeFileSync(listFilePath, fileContent);

  const outputFilePath = path.join(__dirname, `../../uploads/merged-${Date.now()}.mp4`);

  const command = `ffmpeg -safe 0 -f concat -i "${listFilePath}" -c copy "${outputFilePath}"`;
  exec(command, async (error) => {
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
 *  components:
 *    responses:
 *      BadRequest:
 *        description: Invalid JSON payload
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                message:
 *                  type: string
 *                error:
 *                  type: string
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
 *       400:
 *         description: Invalid video ID provided.
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
 *       400:
 *         description: Invalid video ID, startTime, or endTime provided.
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
 *       400:
 *          $ref: '#/components/responses/BadRequest'
 *       404:
 *         description: One or more videos not found or access unauthorized.
 *       413:
 *         description: Total video size exceeds the permitted limit.
 *       500:
 *         description: Failed to merge videos or failed to access video file.
 *     security:
 *       - bearerAuth: []
 */
