import React, { useState, useRef, useEffect } from 'react';
import { Send, Upload, Image, Loader2, X, AlertCircle } from 'lucide-react';

export default function VisionChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const uploadToCatbox = async (file) => {
    try {
      setUploading(true);
      setUploadError('');

      // Check file size (max 200MB for Catbox)
      if (file.size > 200 * 1024 * 1024) {
        throw new Error('File too large. Max size is 200MB');
      }

      const formData = new FormData();
      formData.append('reqtype', 'fileupload');
      formData.append('fileToUpload', file);

      const response = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const url = await response.text();
      
      if (!url || url.trim() === '' || url.includes('error') || url.includes('Error')) {
        throw new Error('Invalid response from Catbox');
      }

      return url.trim();
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error.message);
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file');
      return;
    }

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => setSelectedImage(e.target.result);
      reader.readAsDataURL(file);

      // Upload to Catbox
      const url = await uploadToCatbox(file);
      setImageUrl(url);
      
      // Add system message
      setMessages(prev => [...prev, {
        type: 'system',
        content: `✅ Image uploaded successfully!\n📎 URL: ${url}`,
        imageUrl: url,
        timestamp: new Date()
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        type: 'error',
        content: `❌ Failed to upload image: ${error.message}\n\nTry:\n• Using a smaller image\n• Different image format (JPG/PNG)\n• Checking your internet connection`,
        timestamp: new Date()
      }]);
    }
  };

  const formatResponse = (text) => {
    // Split by headers (##)
    const sections = text.split(/(?=##\s)/);
    
    return sections.map((section, idx) => {
      // Check if it's a header
      const headerMatch = section.match(/^##\s*(.+?)$/m);
      
      if (headerMatch) {
        const headerText = headerMatch[1];
        const content = section.replace(/^##\s*.+?$/m, '').trim();
        
        return (
          <div key={idx} className="mb-4">
            <h3 className="text-lg font-bold text-blue-300 mb-2 flex items-start gap-2">
              <span className="text-blue-500">▸</span>
              {headerText}
            </h3>
            <div className="pl-4 space-y-2">
              {formatContent(content)}
            </div>
          </div>
        );
      } else {
        return <div key={idx} className="mb-3">{formatContent(section)}</div>;
      }
    });
  };

  const formatContent = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    
    return lines.map((line, idx) => {
      // LaTeX inline math: \(...\)
      if (line.includes('\\(') && line.includes('\\)')) {
        const parts = line.split(/(\\[[^\]]+\\])/);
        return (
          <p key={idx} className="mb-2 leading-relaxed">
            {parts.map((part, i) => {
              if (part.match(/\\[[^\]]+\\]/)) {
                const formula = part.replace(/\\\[|\\\]/g, '');
                return (
                  <code key={i} className="bg-blue-900 bg-opacity-30 px-2 py-1 rounded text-blue-200 font-mono text-sm mx-1">
                    {formula}
                  </code>
                );
              }
              return <span key={i}>{part}</span>;
            })}
          </p>
        );
      }
      
      // LaTeX block math: \[...\]
      if (line.includes('\\[') && line.includes('\\]')) {
        const formula = line.replace(/\\\[|\\\]/g, '').trim();
        return (
          <div key={idx} className="my-3 p-3 bg-gray-800 rounded-lg border border-gray-600">
            <code className="text-blue-200 font-mono text-base block text-center">
              {formula}
            </code>
          </div>
        );
      }

      // Boxed answer
      if (line.includes('$\\boxed{')) {
        const answerMatch = line.match(/\$\\boxed\{([^}]+)\}\$/);
        const answer = answerMatch ? answerMatch[1] : '';
        return (
          <div key={idx} className="my-3 p-4 bg-gradient-to-r from-green-900 to-blue-900 rounded-lg border-2 border-green-500">
            <p className="text-lg font-bold text-center text-green-200">
              Final Answer: <span className="text-white">{answer}</span>
            </p>
          </div>
        );
      }

      // Regular text
      return <p key={idx} className="mb-2 leading-relaxed">{line}</p>;
    });
  };

  const processWithVision = async (question, imgUrl) => {
    try {
      setProcessing(true);
      const apiUrl = `https://api.bk9.dev/ai/vision?q=${encodeURIComponent(question)}&image_url=${encodeURIComponent(imgUrl)}&model=meta-llama/llama-4-scout-17b-16e-instruct`;
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status && data.BK9) {
        return data.BK9;
      } else {
        throw new Error('Invalid API response format');
      }
    } catch (error) {
      console.error('Vision API error:', error);
      throw error;
    } finally {
      setProcessing(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || processing) return;

    if (!imageUrl) {
      setUploadError('Please upload an image first');
      return;
    }

    const userMessage = {
      type: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      const response = await processWithVision(input, imageUrl);
      
      setMessages(prev => [...prev, {
        type: 'assistant',
        content: response,
        timestamp: new Date()
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        type: 'error',
        content: `❌ Failed to process request: ${error.message}\n\nPlease try again or check:\n• Image URL is accessible\n• API service is available`,
        timestamp: new Date()
      }]);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImageUrl('');
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-lg">
              <Image className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">AI Vision Chat</h1>
              <p className="text-sm text-gray-400">Upload images and ask questions</p>
            </div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={18} />
                Upload Image
              </>
            )}
          </button>
        </div>
      </div>

      {/* Upload Error Alert */}
      {uploadError && (
        <div className="bg-red-900 border-b border-red-700 px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center gap-2 text-red-200">
            <AlertCircle size={18} />
            <span className="text-sm">{uploadError}</span>
            <button onClick={() => setUploadError('')} className="ml-auto text-red-300 hover:text-white">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-20">
              <Image size={64} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg">Upload an image to start analyzing</p>
              <p className="text-sm mt-2">Powered by Llama 4 Scout Vision</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-3xl rounded-2xl px-4 py-3 ${
                msg.type === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : msg.type === 'system'
                  ? 'bg-gray-700 text-gray-200 border border-gray-600'
                  : msg.type === 'error'
                  ? 'bg-red-900 text-red-100 border border-red-700'
                  : 'bg-gray-700 text-gray-100'
              }`}>
                {msg.imageUrl && (
                  <img 
                    src={msg.imageUrl} 
                    alt="Uploaded" 
                    className="rounded-lg mb-2 max-w-sm"
                  />
                )}
                {msg.type === 'assistant' ? (
                  <div className="text-gray-100">
                    {formatResponse(msg.content)}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                )}
                <p className="text-xs opacity-70 mt-2">
                  {msg.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {processing && (
            <div className="flex justify-start">
              <div className="bg-gray-700 rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 size={18} className="animate-spin text-blue-400" />
                <span className="text-gray-300">Analyzing image...</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Image Preview */}
      {selectedImage && (
        <div className="bg-gray-800 border-t border-gray-700 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <img src={selectedImage} alt="Preview" className="h-16 w-16 object-cover rounded-lg" />
            <div className="flex-1 text-sm text-gray-300">
              <p className="font-semibold">✅ Image ready</p>
              <p className="text-xs text-gray-400 truncate">{imageUrl}</p>
            </div>
            <button
              onClick={clearImage}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-4">
        <div className="max-w-4xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={imageUrl ? "Ask a question about the image..." : "Upload an image first..."}
            disabled={!imageUrl || processing}
            className="flex-1 bg-gray-700 text-white placeholder-gray-400 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !imageUrl || processing}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white p-3 rounded-xl transition-colors disabled:cursor-not-allowed"
          >
            {processing ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
