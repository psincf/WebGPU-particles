export interface Work {
    mouse_position: [number, number],
    num_particles: number,
    power: number,
    energy_conservation: number,
    particles: SharedArrayBuffer,
    mouse_clicked: Boolean
}

export function work() {
    var count = 0
    var total = 0

    onmessage = (e) => {
        if (e.data.fromPool) {
            count = e.data.count
            total = e.data.total
        } else if (e.data.workCpu) {
            var bufferWorkAmount = new Int32Array(e.data.workDoneAmount)
            var bufferWorkdone = new Int32Array(e.data.workDone)

            update_particles(e.data.work)

            Atomics.add(bufferWorkAmount, 0, 1)

            if (count == 0) {
                while (Atomics.load(bufferWorkAmount, 0) < total) {}
                Atomics.notify(bufferWorkdone, 0, 1)
            }
        }
    }

    function update_particles(work: Work) {
        var particles = new Float32Array(work.particles)

        const begin = Math.trunc((work.num_particles / total) * count)
        const end = Math.trunc((work.num_particles / total) * count + work.num_particles / total)

        for (let i = begin; i < end; i += 1) {

            if (work.mouse_clicked) {
                const distance = {
                    x: work.mouse_position[0] - particles[i * 4],
                    y: work.mouse_position[1] - particles[i * 4 + 1],
                };

                const length = Math.sqrt(distance.x * distance.x + distance.y * distance.y)

                const d_norm = {
                    x: distance.x / length,
                    y: distance.y / length
                };

                particles[i * 4 + 2] += d_norm.x / ((1 / work.power) * Math.max(length, 4))
                particles[i * 4 + 3] += d_norm.y / ((1 / work.power) * Math.max(length, 4))
            }
            
            particles[i * 4 + 2] *= work.energy_conservation
            particles[i * 4 + 3] *= work.energy_conservation
            
            particles[i * 4] += particles[i * 4 + 2]
            particles[i * 4 + 1] += particles[i * 4 + 3]
        }
    }
}