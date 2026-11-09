import react from "@vitejs/plugin-react"
import framer from "vite-plugin-framer"
import mkcert from "vite-plugin-mkcert"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), mkcert(), framer()],
})
