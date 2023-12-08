import Gui from 'lil-gui';
import { App, UpdateMode } from './app';

export function init_gui(app: App) {
    const gui = new Gui();

    const folder = gui.addFolder("Particles")
    folder.add(app, "num_particles").listen().disable()
    folder.add(app, "mul2").name("x2 particles")
    folder.add(app, "div2").name("/2 particles")

    gui.add(app, "energy_conservation", 0, 1).listen()
    gui.add(app, "energy_conservation_gui", 0, 1).onChange(() => {
        app.energy_conservation = 1 - Math.pow(0.5, app.energy_conservation_gui * 10)
    })
    gui.add(app, "power", 0, 1_000).listen()
    gui.add(app, "power_gui", 0, 100).onChange(() => {
        app.power = Math.pow(10, app.power_gui / 20)
    })

    gui.addColor(app, "color_origin")
    gui.addColor(app, "color_fast")
    gui.add(app, "color_alpha", 0, 1)
    gui.add(app, "size_particles", 0, 10, 1)

    gui.add(app, "update_mode", { CPU: UpdateMode.CPU, GPU: UpdateMode.GPU }).onChange(() => {
        app.change_update_mode(app.update_mode)
    })
}
