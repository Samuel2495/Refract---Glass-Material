import React from "react"
import ReactDOM from "react-dom/client"
import { framer } from "framer-plugin"
import { App } from "./App"
import "./styles.css"

framer.showUI({ position: "top right", width: 340, height: 660 })

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
