/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {}],
  },
  testRegex: "__tests__/.*\\.test\\.ts$", // Match only files ending with .test.ts in the __tests__ directory  
  collectCoverage: true, 
  coverageDirectory: 'coverage',
  testPathIgnorePatterns: [
    "/node_modules"
  ],
  verbose: true, 
  coverageThreshold:{
    global:{
      branches: 100,
      functions: 100,
      lines:100,
      statements: 100
    }
  }
};