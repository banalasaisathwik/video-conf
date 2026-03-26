import {  useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "react-toastify"

const Home = () =>{
    const [roomId,setRoomId] = useState("")
    const [name,setName] = useState("")

    const navigate = useNavigate()  
   

    function handleJoin(){
        if(!name || !roomId){
            toast("please fill the above details")
            return
        }
        navigate(`/room/${roomId}`,{state:{name : name}})
    }


    return(
        <>
        <input
        value={roomId}
        onChange={(e)=> setRoomId(e.target.value)}
        placeholder="Meeting ID"
        />
        <input
        value={name}
        onChange={(e)=> setName(e.target.value)}
        placeholder="Name"
        />
        <button onClick={handleJoin}> Join </button>
        
        </>
    )
} 

export {Home}