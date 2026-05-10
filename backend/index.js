import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import crypto from "crypto";
import { prisma } from "./lib/prisma";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

dotenv.config();
const randomBytes = crypto.randomBytes(32).toString("hex");

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.BUCKET_ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3Client = new S3Client({
  region: bucketRegion,
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
});

const app = express();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

upload.single("image");

app.get("/api/posts", async (req, res) => {
  const posts = await prisma.image.findMany();

  for (const post of posts) {
    const getObjectParams = {
      Bucket: bucketName,
      Key: post.imageName,
    };

    const command = new GetObjectCommand(getObjectParams);

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: 60,
    });

    post.imageUrl = url;
  }

  res.send(posts);
});

app.post("/api/posts", upload.single("image"), async (req, res) => {
  (console.log("req.body", req.body), console.log("Uploading file to S3..."), console.log("req.file", req.file));
  const imageName = randomBytes + "-" + req.file.originalname;
  req.file.buffer;
  const params = {
    Bucket: bucketName,
    Key: imageName,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  };

  const command = new PutObjectCommand(params);
  await s3Client.send(command);

  const post = await prisma.image.create({
    data: {
      imageName: imageName,
      caption: req.body.caption || null,
    },
  });
  console.log("Post created:", post);
  res.send(post);
});

app.delete("/api/posts/:id", async (req,res) =>{
  const postId =  req.params.id;
  const post = await prisma.image.findUnique({
    where: {
      id: (postId),
    },
  });

  if(!post){
    return res.status(404).send({error: "Post not found"});
    return;
  }
  await prisma.image.delete({
    where: {
      id: (postId),
    },
  });
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: post.imageName,
  });
  await s3Client.send(command);

  res.send(post);
})





app.listen(8080, () => {
  console.log("Server is running on http://localhost:8080");
});
