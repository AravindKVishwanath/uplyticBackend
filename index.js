const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const fs = require("fs");
const { GoogleGenerativeAI } = require('@google/generative-ai');
const PlayHT = require('playht');
const path = require('path');
const User = require("./models/User");
require("dotenv").config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());



// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://aravindkvishwanath59:aravind@uplytic.qajam.mongodb.net/";
mongoose
    .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error("Error connecting to MongoDB:", err));

// Initialize PlayHT
PlayHT.init({
    userId: '5WokS2SlnXSD0K8QDxmH49O5Ifp1',
    apiKey: '59d095187c8941d994956df1ad4664bc',
});

const generatePersonalizedContent = async (userData, quizResults) => {
    // Prepare the prompt for the model
    const genAI = new GoogleGenerativeAI("AIzaSyAqvKsvK2W57sbWeTlUk1pdN3MJqD-4wl8");
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      Based on the following user preferences:
      - Learning Style: ${userData.learning_style}
      - Quiz Results: ${JSON.stringify(quizResults)}
  
      Generate a learning resource all strictly pythonfor the user with the following format:
      1. reading_content: <Generated reading content as per his/her learning style>
      2. assignment: <Generated 2-3 assignment tasks as array>
      3. references: <Relevant references for further reading>
    `;
  
    try {
      // Initialize the Gemini model with the appropriate API request
      const response = await model.generateContent(prompt);
      // Extract the response and split based on the required structure
      // Extract responseText safely
      const responseContent = JSON.parse((response.response?.['candidates']?.[0]?.['content']["parts"][0]['text']).replace(/```json/g, '').replace(/```/g, ''));
      console.log(typeof responseContent)
      let readingContent,assignment,references
      if (typeof responseContent === 'object' && responseContent !== null) {
        // Extract the relevant fields directly from the JSON
        readingContent = responseContent['reading_content'] || '';
        assignment = responseContent["assignment"] || '';
        references = responseContent["references"] || '';
      
        console.log('Reading Content:', readingContent);
        console.log('Assignment:', assignment);
        console.log('References:', references);
      } else {
        console.error('Unexpected response format or responseContent is not a JSON object:', responseContent);
      }
      
// Further operations on readingContent, assignment, and references can follow here.

  
      return {
        reading_content: readingContent,
        assignment: assignment,
        references: references,
      };
    } catch (error) {
      console.error('Error generating content:', error);
      throw new Error('Error generating content');
    }
  };

// Serve static files
app.use('/files', express.static(path.join(__dirname, 'files')));

app.post('/generate-audio', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text is required to generate audio.' });
        }
       
            const stream = await PlayHT.stream(text, { voiceEngine: 'Play3.0-mini' });
            stream.on('data', (chunk) => {
              // Do whatever you want with the stream, you could save it to a file, stream it in realtime to the browser or app, or to a telephony system
              fs.appendFileSync('output.mp3', chunk);
            });
            const filePath = path.join(__dirname, 'files', 'output.mp3');

        // Use a writable stream to save the file
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).json({ error: 'Audio file not found' });
        }
    } catch (error) {
        console.error('Error in /generate-audio:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


///////////////////////////////////////////////
//////////////////////////////////////////////
// Endpoint for generating quiz questions
app.post('/app', async (req, res) => {
    try {
        const genAI = new GoogleGenerativeAI("AIzaSyAqvKsvK2W57sbWeTlUk1pdN3MJqD-4wl8");
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const topic = req.body.topic || 'General Knowledge';
        const prompt = `
            Generate 15 quiz questions with four options each, and the subtopics i want them to be in order of learning for a beginner and i want you to generate 3 such subtopics
            along with the correct answer and subtopic on the topic: ${topic}.
            Format: [{"question": "Question1?", "options": ["Option1", "Option2", "Option3", "Option4"], "correctAnswer": "Option1", "subtopic": "Subtopic1"}, {...}]
        `;

        const result = await model.generateContent(prompt);

        let responseText = typeof result.response.text === 'function' ? result.response.text() : result.response.text;
        responseText = responseText.replace(/```json|```/g, '').trim();
        const data = JSON.parse(responseText);

        if (!Array.isArray(data)) {
            throw new Error('Invalid data format received from Gemini API');
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Error generating quiz questions:', error);
        res.status(500).json({ error: 'Failed to generate quiz questions', details: error.message });
    }
});

app.post('/generate-content', async (req, res) => {
    const { userData, quizResults } = req.body;
  
    try {
      const generatedContent = await generatePersonalizedContent(userData, quizResults);
      res.json(generatedContent);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate content' });
    }
  });

// Endpoint for chat interaction
app.post('/chat', async (req, res) => {
    try {
        const genAI = new GoogleGenerativeAI("AIzaSyAqvKsvK2W57sbWeTlUk1pdN3MJqD-4wl8");
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const userQuestion = req.body.message;
        console.log('Request body:', req.body);

        if (!userQuestion) {
            return res.status(400).json({ error: 'Question is required' });
        }

        // Prompt to limit response to 50 words
        const prompt = `
            Answer the following question in 50 words or less: ${userQuestion}
        `;

        const result = await model.generateContent(prompt);

        let responseText = typeof result.response.text === 'function' ? result.response.text() : result.response.text;
        responseText = responseText.replace(/```json|```/g, '').trim();

        // Check if the response length is within the 50-word limit
        const words = responseText.split(/\s+/);
        if (words.length > 50) {
            responseText = words.slice(0, 50).join(' ') + '...';
        }

        res.status(200).json({ answer: responseText });
    } catch (error) {
        console.error('Error generating chat response:', error);
        res.status(500).json({ error: 'Failed to generate chat response', details: error.message });
    }
});

app.post('/gemini', async (req, res) => {
    try {
        const genAI = new GoogleGenerativeAI("AIzaSyAqvKsvK2W57sbWeTlUk1pdN3MJqD-4wl8");
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const topic = req.body.topic || 'General Knowledge';
        const performance = req.body.performance || {};
        const prompt = `
            Based on the topic "${topic}" and user performance data: ${JSON.stringify(performance)},
            generate a detailed roadmap for improvement. Include three subtopics with explanations for beginners,
            recommended resources, and tips for each subtopic.
            Format: [{"subtopic": "Subtopic1", "description": "Details", "resources": ["Resource1", "Resource2"], "tips": ["Tip1", "Tip2"]}, {...}]
        `;

        const result = await model.generateContent(prompt);

        // Safely handle the API response
        let responseText = result.response.text;
        if (typeof responseText === 'function') {
            responseText = responseText();
        }

        responseText = responseText.replace(/```json|```/g, '').trim(); // Remove formatting artifacts

        try {
            const roadmap = JSON.parse(responseText); // Attempt to parse JSON
            if (!Array.isArray(roadmap)) {
                throw new Error('Invalid roadmap format'); // Ensure it's an array
            }
            res.status(200).json({ message: 'Roadmap generated successfully', roadmap });
        } catch (parseError) {
            throw new Error(`Failed to parse roadmap JSON: ${responseText}`);
        }
    } catch (error) {
        console.error('Error generating roadmap:', error);
        res.status(500).json({ error: 'Failed to generate roadmap', details: error.message });
    }
});
///////////////////////////////////////////////
///////////////////////////////////////////////

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        res.status(200).json({ success: true, message: 'Login successful.', userId: user._id });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Add a new course to a user
app.post('/add-course', async (req, res) => {
    const { userId, course } = req.body;

    try {
        const user = await User.findById({ _id: userId });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.courses.push(course);
        await user.save();
        res.status(200).json({ message: 'Course added successfully', user });
    } catch (error) {
        res.status(500).json({ message: 'Error adding course', error });
    }
});

// Get all courses of a user
app.get('/get-courses/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ courses: user.courses });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving courses', error });
    }
});

// Signup Route
app.post("/signup", async (req, res) => {
    try {
        const { username, email, password, traits } = req.body;

        // Validate input
        if (!username || !email || !password || !traits) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new user
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            learningStyle: {
                speed: traits[0],
                engagement: traits[1],
                retention: traits[2],
                contentPreference: traits[3],
            },
        });

        // Save to database
        const savedUser = await newUser.save();

        res.status(201).json({ message: "User registered successfully", user: savedUser });
    } catch (error) {
        console.error("Error during signup:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});


// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


