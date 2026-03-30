import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { RoomPage } from './pages/RoomPage'
import { useEffect } from 'react';
import { connect } from './services/socket';

function App() {
  useEffect(() => {
  connect();
}, []);

  return(
     <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home/>}/>
      <Route path="/room/:roomId" element={<RoomPage/>}/>
    </Routes>
    </BrowserRouter>
  )
}

export default App
