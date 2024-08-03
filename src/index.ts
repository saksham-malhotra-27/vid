import express from "express";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from 'swagger-ui-express'
import swaggerOptions from "./swagger";
import videoRoutes from './routes/video';
import authHandler from './routes/user'

const app = express();
app.use(express.json())
app.use(express.urlencoded({extended:true}))

app.use('/api/videos', videoRoutes);
app.use('/api/auth', authHandler)
const swaggerDocs = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs))
const port = process.env.PORT || 3000;
app.get('/', ()=>{
    console.log('hi')
    
})


// set NODE_ENV to something else to run on dev mode
if(process.env.NODE_ENV !== "test"){
app.listen(port, ()=>{
    console.log(`listening...  on ${port}`)
})
}
else {
    console.log("IF YOU WANT TO RUN IN DEV MODE, THEN SET NODE_ENV TO dev IN .ENV")
}
export default app;