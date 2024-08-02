import express from "express";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from 'swagger-ui-express'
import swaggerOptions from "./swagger";
import videoRoutes from './routes/video';

const app = express();
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use('/api/videos', videoRoutes);

const swaggerDocs = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs))
const port = 3000;

app.get('/', ()=>{
    console.log('hi')
    
})


app.listen(port, ()=>{
    console.log('listening... ')
})