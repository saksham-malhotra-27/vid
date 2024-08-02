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
      console.log(error)
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
          console.log(video)
    
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

    const outputPath = `uploads/trimmed-${Date.now()}-${path.basename(video.filepath)}`;

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
  const str = req.body.toString('utf-8');
  const jsonStr = JSON.parse(str);
  const result = requestSchema.safeParse(jsonStr);
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
          console.error('Error accessing video file:', error);
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
              console.error(`ffmpeg error: ${error.message}`);
              console.error(`stderr: ${stderr}`);
              return res.status(500).json({ message: "Failed to merge videos", error: String(error)});
          }

          console.log(`ffmpeg stdout: ${stdout}`);
          
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