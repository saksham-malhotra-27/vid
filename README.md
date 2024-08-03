# Node.Js Video Editor
![Screenshot 2024-08-03 081601](https://github.com/user-attachments/assets/1b7b9024-b7d4-4694-8dd9-1a03297952f5)

## Installation

1. Navigate to the project directory:
   ```bash
   cd vid
   npm install
2. Create a '.env', with this:
  ```
  JWT_SECRET="asvdbagsdyaewiawudhau"
  PORT=3000
  NODE_ENV="test"  # Set to "test" for testing environment, otherwise omit or set to "production"
  ```
3. Run the application in development mode:
  ```
  npm run dev
  ```
4. If you encounter any issues, ensure that TypeScript is installed globally:
  ```
  npm install -g typescript
  ```
5. Finally, access the Swagger API documentation at:
`http://localhost:<PORT>/api-docs`, where PORT is by default 3000 or the Port Number you had used in .env 

## Running Tests
To run tests, ensure the production environment is set to "test" in your .env file:
`NODE_ENV="test"`

Execute the tests using the following command:
`npm run test`

## Resources Used

- [Got to know about ffmpeg with Node.js](https://medium.com/nerd-for-tech/writing-a-video-encoder-using-node-js-and-ffmpeg-b909442472a9)
- [Got to know about conversions](https://medium.com/@kusalkalingainfo/convert-audio-files-using-fluent-ffmpeg-library-86aeb3c1b6b7)
- [Youtube: Swagger Guide ](https://www.youtube.com/watch?v=dhMlXoTD3mQ&t=256s)
- [YouTube: Fluent-FFmpeg Guide](https://www.youtube.com/watch?v=hq6KdY-76z8)
- [Vitest Setup with Serverless Framework & Node.js](https://awstip.com/vitest-setup-with-serverless-framework-node-js-express-js-af75bdcbaef8)

