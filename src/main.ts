import { init_gui } from "./gui";
import { App } from "./app";

function errGpu(err) {
    const p = document.createElement("p");
    p.textContent = err;
    document.body.replaceChild(p, document.querySelector("canvas")!);
}

const app = new App()

app.init()
    .catch(errGpu)
    .then(() => {
        app.set_num_particles(65_536)
        init_gui(app)
        const updateEveryFrame = function() {
            window.requestAnimationFrame(
                () => {
                    app.update()
                    updateEveryFrame()
                }
            )
        }
        updateEveryFrame()
})

function onMouseMove(e: MouseEvent) {
    app.mouse_position = [e.x - app.canvas.width / 2, e.y - app.canvas.height / 2]
}

app.canvas.addEventListener("mousemove", onMouseMove)
