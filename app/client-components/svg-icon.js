import Beer from "../../public/icons/beer-svgrepo-com.svg"
import Coffee from "../../public/icons/coffee-svgrepo-com.svg"
import Cake from "../../public/icons/cake-svgrepo-com.svg"
import Flash from "../../public/icons/flash-svgrepo-com.svg"
import IceCream from "../../public/icons/ice-cream-svgrepo-com.svg"
import Idea from "../../public/icons/idea-svgrepo-com.svg"
import King from "../../public/icons/king-svgrepo-com.svg"
import Mountain from "../../public/icons/mountain-svgrepo-com.svg"
import Nut from "../../public/icons/nut-svgrepo-com.svg"
import Pizza from "../../public/icons/pizza-svgrepo-com.svg"
import Plant from "../../public/icons/plant-svgrepo-com.svg"
import Radio from "../../public/icons/radio-svgrepo-com.svg"
import Skull from "../../public/icons/skull-svgrepo-com.svg"
export default function Icon({icon}){

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