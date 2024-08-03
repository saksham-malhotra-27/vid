# Node.Js Video Editor

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

### Running Tests
To run tests, ensure the production environment is set to "test" in your .env file:
`NODE_ENV="test"`

Execute the tests using the following command:
`npm run test`
