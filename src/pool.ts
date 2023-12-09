import { Work, work } from "./worker"

export class Pool {
    num_threads: number = 0
    threads: Array<Worker> = new Array()
    workDone: SharedArrayBuffer = new SharedArrayBuffer(4)
    workDoneAmount: SharedArrayBuffer = new SharedArrayBuffer(4)

    set_num_threads(n_threads: number) {
        const blob = new Blob([work.toString() + "work()"])
        const url = URL.createObjectURL(blob)
        
        let diff = n_threads - this.num_threads

        if (diff >= 0) {
            for (let i = 0; i < diff; i += 1) {
                const worker = new Worker(url);
                this.threads.push(worker)
            }
        } else {
            for (let i = 0; i < -diff; i += 1) {
                const worker = this.threads.pop()
                worker.terminate()
            }
        }

        this.num_threads = n_threads

        var i = 0
        for (let w of this.threads) {
            w.postMessage({
                fromPool: true,
                count: i,
                total: n_threads
            })
            i += 1
        }
    }

    sendWork(work: Work) {
        var buffer = new Int32Array(this.workDone)
        Atomics.store(buffer, 0, 0)

        for (let w of this.threads) {
            w.postMessage({
                workCpu: true,
                workDone: this.workDone,
                workDoneAmount: this.workDoneAmount,
                work: work
            })
        }
    }

    async wait() {
        var buffer = new Int32Array(this.workDone)
        var a = await Atomics.waitAsync(buffer, 0, 0).value
    }
}