import Beer from "@/assets/icons/beer-svgrepo-com.svg"
import Coffee from "@/assets/icons/coffee-svgrepo-com.svg"
import Cake from "@/assets/icons/cake-svgrepo-com.svg"
import Flash from "@/assets/icons/flash-svgrepo-com.svg"
import IceCream from "@/assets/icons/ice-cream-svgrepo-com.svg"
import Idea from "@/assets/icons/idea-svgrepo-com.svg"
import King from "@/assets/icons/king-svgrepo-com.svg"
import Mountain from "@/assets/icons/mountain-svgrepo-com.svg"
import Nut from "@/assets/icons/nut-svgrepo-com.svg"
import Pizza from "@/assets/icons/pizza-svgrepo-com.svg"
import Plant from "@/assets/icons/plant-svgrepo-com.svg"
import Radio from "@/assets/icons/radio-svgrepo-com.svg"
import Skull from "@/assets/icons/skull-svgrepo-com.svg"
export default function Icon({icon}:{icon:string}) {

    switch(icon){
        case 'Beer':
            return <Beer width="20px" height="20px"/>
        case 'Cake':
            return <Cake width="20px" height="20px"/>
        case 'Flash':
            return <Flash width="20px" height="20px"/>
        case 'IceCream':
            return <IceCream width="20px" height="20px"/>
        case 'Idea':
            return <Idea width="20px" height="20px"/>
        case 'King':
            return <King width="20px" height="20px"/>
        case 'Mountain':
            return <Mountain width="20px" height="20px"/>
        case 'Nut':
            return <Nut width="20px" height="20px"/>
        case 'Pizza':
            return <Pizza width="20px" height="20px"/>
        case 'Plant':
            return <Plant width="20px" height="20px"/>
        case 'Radio':
            return <Radio width="20px" height="20px"/>
        case 'Skull':
            return <Skull width="20px" height="20px"/>
        default:
            return <Coffee width="20px" height="20px"/>
    }
}