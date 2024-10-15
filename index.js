require("dotenv").config(); // Load environment variables from .env file
const express = require("express");
const multer = require("multer");
const pdf = require("pdf-parse");
const axios = require("axios");
const helmet = require("helmet");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet()); // Use helmet for security
app.use(bodyParser.json()); // Middleware for parsing JSON requests

const storage = multer.memoryStorage();
const upload = multer({ storage });

let extractedText = ""; // Store the PDF content globally

// Extract PDF and store the text
app.post("/upload", upload.single("pdf"), (req, res, next) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  pdf(req.file.buffer)
    .then((data) => {
      extractedText = data.text; // Store the full extracted text
      // console.log("Extracted Text: ", extractedText); // Log the complete extracted text
      res.json({ message: "PDF uploaded and text extracted successfully." });
    })
    .catch((error) => {
      console.error("Error extracting PDF:", error);
      return res.status(500).send("Error extracting PDF: " + error.message);
    });
});

// Ask questions based on the extracted text
app.post("/ask", async (req, res, next) => {
  const { question } = req.body;

  if (!extractedText) {
    return res
      .status(400)
      .send("No PDF text available for answering questions.");
  }

  // Process the question to find relevant context
  const relevantText = findRelevantText(question, extractedText);
  // console.log(relevantText);
  if (!relevantText) {
    return res
      .status(404)
      .json({ answer: "Sorry, I couldn't find relevant information." });
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `Based on the following text from a PDF, please answer the question:\n\n${question}\n\nQuestion: ${question}`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(response);
    const answer = response.data.choices[0].message.content.trim();
    res.json({ answer });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ answer: "Sorry, I couldn't process your question." });
  }
});

// Function to find relevant text based on the question
function findRelevantText(question, text) {
  const keywords = question.split(" ").map((word) => word.toLowerCase());
  let matchedText = "";

  for (const keyword of keywords) {
    const index = text.toLowerCase().indexOf(keyword);
    if (index !== -1) {
      const start = Math.max(0, index - 30);
      const end = Math.min(text.length, index + 30);
      matchedText += text.substring(start, end) + "... ";
    }
  }

  return matchedText.trim() || null;
}

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
