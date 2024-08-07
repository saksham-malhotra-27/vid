/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {}],
  },
  testRegex: "__tests__/.*\\.test\\.ts$", // Match only files ending with .test.ts in the __tests__ directory  
  testPathIgnorePatterns: [
    "/node_modules"
  ],
  verbose: true, 
};