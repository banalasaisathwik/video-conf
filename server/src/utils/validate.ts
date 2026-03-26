function safeParse(data:string) {
    try{
        return JSON.parse(data)
    }
    catch{
        return null
    }
}

export {safeParse}