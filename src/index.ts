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
const port = 3000;
app.get('/', ()=>{
    console.log('hi')
    
})


app.listen(port, ()=>{
    console.log('listening... ')
    console.log(port)
})