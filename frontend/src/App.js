import React, { useState, useEffect, useRef, useReducer, useCallback } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';
// import { motion } from 'framer-motion'; // Bỏ comment nếu dùng framer-motion
import './App.css';

const BASE_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '';

const messagesReducer = (state, action) => {
  switch (action.type) {
    case 'SET_MESSAGES':
      return action.payload;
    case 'ADD_MESSAGE':
      return [...state, action.payload];
    case 'UPDATE_SEEN':
      return state.map((msg) =>
        msg.senderId === action.senderId && !msg.seen ? { ...msg, seen: true } : msg
      );
    default:
      return state;
  }
};

const ChatArea = React.memo(({ selectedUser, currentUserId, users, socket, onlineStatus }) => {
  const [content, setContent] = useState('');
  const [messages, dispatch] = useReducer(messagesReducer, []);
  const [typingUser, setTypingUser] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    try {
      const response = await axios.get(`${BASE_URL}/api/messages?username=${selectedUser}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      dispatch({ type: 'SET_MESSAGES', payload: response.data || [] });
    } catch (error) {
      console.log('Error fetching messages:', error);
      dispatch({ type: 'SET_MESSAGES', payload: [] });
    }
  }, [selectedUser]);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages();
      const sender = users.find(u => u.username === selectedUser);
      if (sender && socket && onlineStatus[sender._id]) {
        socket.emit('markAsSeen', { senderId: sender._id });
      }
    }
  }, [selectedUser, socket, users, onlineStatus, fetchMessages]);

  useEffect(() => {
    if (!socket) return;
      const handleNewMessage = (msg) => {
      const selectedUserId = users.find(u => u.username === selectedUser)?._id;
      if (msg.senderId !== currentUserId) {
        if (
          (msg.senderId === selectedUserId && msg.receiverId === currentUserId) ||
          (msg.receiverId === selectedUserId && msg.senderId === currentUserId)
        ) {
          dispatch({ type: 'ADD_MESSAGE', payload: msg });
        }
      }
    };

    const handleReceiveFile = (msg) => {
      const selectedUserId = users.find(u => u.username === selectedUser)?._id;
      if (
        (msg.senderId === currentUserId && msg.receiverId === selectedUserId) ||
        (msg.senderId === selectedUserId && msg.receiverId === currentUserId)
      ) {
        dispatch({ type: 'ADD_MESSAGE', payload: msg });
      }
    };

    const handleMessageSeen = ({ senderId }) => {
      const selectedUserId = users.find(u => u.username === selectedUser)?._id;
      if (senderId === selectedUserId || senderId === currentUserId) {
        dispatch({ type: 'UPDATE_SEEN', senderId });
      }
    };

    const handleTyping = ({ senderId }) => {
      const typingUser = users.find(u => u._id === senderId);
      if (typingUser && typingUser.username === selectedUser) {
        setTypingUser(typingUser.username);
      }
    };

    const handleStopTyping = ({ senderId }) => {
      const typingUser = users.find(u => u._id === senderId);
      if (typingUser && typingUser.username === selectedUser) {
        setTypingUser(null);
      }
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('receiveFile', handleReceiveFile);
    socket.on('messageSeen', handleMessageSeen);
    socket.on('typing', handleTyping);
    socket.on('stopTyping', handleStopTyping);

    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('receiveFile', handleReceiveFile);
      socket.off('messageSeen', handleMessageSeen);
      socket.off('typing', handleTyping);
      socket.off('stopTyping', handleStopTyping);
    };
  }, [socket, selectedUser, currentUserId, users]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleTyping = (e) => {
    setContent(e.target.value);
    if (!socket || !selectedUser) return;

    const receiver = users.find(u => u.username === selectedUser);
    if (!receiver) return;

    socket.emit('typing', { receiverId: receiver._id });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stopTyping', { receiverId: receiver._id });
    }, 2000);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!selectedUser) return alert('Please select a user to chat with');
    try {
      const response = await axios.post(
        `${BASE_URL}/api/messages`,
        { receiverUsername: selectedUser, content },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      dispatch({ type: 'ADD_MESSAGE', payload: response.data });
      setContent('');
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        socket.emit('stopTyping', { receiverId: users.find(u => u.username === selectedUser)._id });
      }
    } catch (error) {
      alert('Failed to send message');
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !socket || !selectedUser) return;

    const receiver = users.find(u => u.username === selectedUser);
    if (!receiver) return;

    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await axios.post(`${BASE_URL}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const { fileUrl, fileName, fileType } = response.data;
      const fileMessage = {
        senderId: currentUserId,
        receiverId: receiver._id,
        fileUrl,
        fileName,
        fileType,
        isFile: true,
        seen: false,
        timestamp: new Date(),
      };

      socket.emit('sendFile', {
        receiverId: receiver._id,
        fileUrl,
        fileName,
        fileType,
      });
      dispatch({ type: 'ADD_MESSAGE', payload: fileMessage });
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file');
    }
  };

  const handleEmojiClick = (emojiObject) => {
    setContent((prev) => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-area">
      {selectedUser ? (
        <>
          <div className="chat-header">
            <h3>Chat with {selectedUser}</h3>
          </div>
          <div className="messages">
            {messages.map((msg, index) => {
              const receiver = users.find(u => u._id === msg.receiverId);
              const isSeenAndOnline = msg.seen && onlineStatus[receiver?._id];
              return (
                // Nếu dùng framer-motion, thay div bằng motion.div như dưới
                // <motion.div
                //   key={index}
                //   className={`message ${msg.senderId === currentUserId ? 'sent' : 'received'}`}
                //   initial={{ opacity: 0, y: 10 }}
                //   animate={{ opacity: 1, y: 0 }}
                //   transition={{ duration: 0.3 }}
                // >
                <div
                  key={index}
                  className={`message ${msg.senderId === currentUserId ? 'sent' : 'received'}`}
                >
                  <div className="message-content">
                    {msg.isFile ? (
                      msg.fileType.startsWith('image/') ? (
                        <img src={msg.fileUrl} alt={msg.fileName} className="chat-image" />
                      ) : (
                        <a href={msg.fileUrl} download={msg.fileName} className="file-link">
                          {msg.fileName}
                        </a>
                      )
                    ) : (
                      msg.content
                    )}
                  </div>
                  <div className="message-meta">
                    <span className="timestamp">{formatTimestamp(msg.timestamp)}</span>
                    {msg.senderId === currentUserId && (
                      <span className={`seen-status ${isSeenAndOnline ? 'seen' : ''}`}>
                        ✓✓
                      </span>
                    )}
                  </div>
                </div>
                // </motion.div>
              );
            })}
            {typingUser && (
              // Nếu dùng framer-motion, thay div bằng motion.div
              // <motion.div
              //   className="typing-indicator"
              //   initial={{ opacity: 0 }}
              //   animate={{ opacity: 1 }}
              //   transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
              // >
              <div className="typing-indicator">
                {typingUser} is typing...
              </div>
              // </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSendMessage} className="message-form">
            <input
              type="text"
              value={content}
              onChange={handleTyping}
              placeholder="Type a message..."
              className="message-input"
            />
            <button
              type="button"
              className="emoji-button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              😊
            </button>
            {showEmojiPicker && (
              // Nếu dùng framer-motion, thay div bằng motion.div
              // <motion.div
              //   className="emoji-picker"
              //   initial={{ y: 20, opacity: 0 }}
              //   animate={{ y: 0, opacity: 1 }}
              //   exit={{ y: 20, opacity: 0 }}
              //   transition={{ duration: 0.3 }}
              // >
              <div className="emoji-picker">
                <EmojiPicker onEmojiClick={handleEmojiClick} />
              </div>
              // </motion.div>
            )}
            <button type="submit" className="send-button">Send</button>
            <label className="file-upload">
              <input type="file" onChange={handleFileChange} style={{ display: 'none' }} />
              📎
            </label>
          </form>
        </>
      ) : (
        <p className="no-chat">Select a user to start chatting</p>
      )}
    </div>
  );
});

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedUser, setSelectedUser] = useState(localStorage.getItem('selectedUser') || '');
  const [users, setUsers] = useState([]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [onlineStatus, setOnlineStatus] = useState({});
  const [socket, setSocket] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await axios.get(`${BASE_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(response.data);
    } catch (error) {
      console.log('Error fetching users:', error);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      if (socket) socket.disconnect();

      const newSocket = io(BASE_URL, { auth: { token }, autoConnect: true });
      setSocket(newSocket);

      newSocket.on('connect', () => console.log('Socket connected:', newSocket.id));
      newSocket.on('connect_error', (err) => console.log('Socket connection error:', err));

      newSocket.on('onlineUsers', ({ users }) => {
        const initialStatus = {};
        users.forEach(userId => (initialStatus[userId] = true));
        setOnlineStatus(initialStatus);
      });

      newSocket.on('userOnline', ({ userId }) => {
        setOnlineStatus((prev) => ({ ...prev, [userId]: true }));
      });

      newSocket.on('userOffline', ({ userId }) => {
        setOnlineStatus((prev) => ({ ...prev, [userId]: false }));
      });

      fetchUsers();
      const tokenPayload = JSON.parse(atob(token.split('.')[1]));
      setCurrentUserId(tokenPayload.userId);

      return () => {
        newSocket.disconnect();
        newSocket.off('onlineUsers');
        newSocket.off('userOnline');
        newSocket.off('userOffline');
        newSocket.off('connect');
        newSocket.off('connect_error');
      };
    } else if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  }, [token, fetchUsers]);

  useEffect(() => {
    if (selectedUser) localStorage.setItem('selectedUser', selectedUser);
  }, [selectedUser]);

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${BASE_URL}/api/auth/register`, { username, password });
      alert('Registration successful! Please login.');
      setIsRegistering(false);
      setUsername('');
      setPassword('');
    } catch (error) {
      alert('Registration failed: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${BASE_URL}/api/auth/login`, { username, password });
      const newToken = response.data.token;
      setToken(newToken);
      localStorage.setItem('token', newToken);
      setUsername('');
      setPassword('');
    } catch (error) {
      alert('Login failed');
    }
  };

  const handleLogout = () => {
    if (socket) socket.disconnect();
    setToken('');
    setSocket(null);
    localStorage.removeItem('token');
    localStorage.removeItem('selectedUser');
    setCurrentUserId('');
    setSelectedUser('');
    setUsers([]);
    setOnlineStatus({});
  };

  return (
    <div className="App">
      {!token ? (
        <div className="auth-container">
          <h2>{isRegistering ? 'Register' : 'Login'}</h2>
          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="auth-form">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="auth-input"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="auth-input"
            />
            <button type="submit" className="auth-button">
              {isRegistering ? 'Register' : 'Login'}
            </button>
          </form>
          <button className="switch-button" onClick={() => setIsRegistering(!isRegistering)}>
            {isRegistering ? 'Switch to Login' : 'Switch to Register'}
          </button>
        </div>
      ) : (
        <div className="chat-container">
          <div className="user-list">
            <div className="user-list-header">
              <h3>Users</h3>
              <button className="logout-button" onClick={handleLogout}>
                Logout
              </button>
            </div>
            {users.map((user) => (
              <div
                key={user._id}
                className={`user ${selectedUser === user.username ? 'selected' : ''}`}
                onClick={() => setSelectedUser(user.username)}
              >
                <span className={`status-dot ${onlineStatus[user._id] ? 'online' : 'offline'}`}></span>
                {user.username}
              </div>
            ))}
          </div>
          <ChatArea
            selectedUser={selectedUser}
            currentUserId={currentUserId}
            users={users}
            socket={socket}
            onlineStatus={onlineStatus}
          />
        </div>
      )}
    </div>
  );
}

export default App;