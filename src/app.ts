const WORKGROUP_SIZE = 8;

export type UpdateCPU = {
    threads: number;
};

export enum UpdateMode {
    CPU,
    GPU
}

export class App {
    canvas: HTMLCanvasElement;
    context: GPUCanvasContext;
    adapter: GPUAdapter;
    device: GPUDevice;
    vertexBuffer: GPUBuffer;
    uniformBuffer: GPUBuffer;

    particlesBuffer1: GPUBuffer;
    particlesBuffer2: GPUBuffer;
    mappedBuffer: GPUBuffer;

    bindGroupLayoutRender: GPUBindGroupLayout;
    bindGroupLayoutCompute: GPUBindGroupLayout;

    bindGroupRenderer1: GPUBindGroup;
    bindGroupRenderer2: GPUBindGroup;

    bindGroupCompute1: GPUBindGroup;
    bindGroupCompute2: GPUBindGroup;

    frame: number = 1;

    renderPipeline: GPURenderPipeline;
    computePipeline: GPUComputePipeline;

    mouse_position: [number, number] = [0, 0];
    particles: SharedArrayBuffer;
    num_particles: number = 1_024;
    energy_conservation: number = 0.998;
    energy_conservation_gui: number = 0.998;
    power: number = 10;
    power_gui: number = 10;

    color_alpha: number = 0.5;
    color_origin: [number, number, number, number] = [1.0, 1.0, 0.0, 1.0]
    color_fast: [number, number, number, number] = [1.0, 0.0, 0.0, 1.0]
    size_particles: number = 1;

    update_mode: UpdateMode = UpdateMode.CPU;
    update_cpu_settings: UpdateCPU = { threads: 1 };

    can_update: Boolean = true;



    async init() {
        this.canvas = document.querySelector("canvas")!;

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        const size_canvas = [this.canvas.width, this.canvas.height]

        if (!navigator.gpu) {
            throw Error("WebGPU not supported")
        }

        this.adapter = await navigator.gpu.requestAdapter()
        if (!this.adapter) {
            throw Error("No GPU compatible")
        }

        this.device = await this.adapter.requestDevice();
        this.context = this.canvas.getContext("webgpu")!;

        const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: canvasFormat,
            //alphaMode: "premultiplied",
        })
        const vertices = new Float32Array([
            -0.5, -0.5,
            0.5, -0.5,
            -0.5, 0.5,
            -0.5, 0.5,
            0.5, -0.5,
            0.5, 0.5
        ]);
        this.vertexBuffer = this.device.createBuffer({
            label: "Vertex Buffer",
            size: 48,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
        });
        this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);

        const vertexBufferLayout: GPUVertexBufferLayout = {
            arrayStride: 8,
            attributes: [{
                format: "float32x2",
                offset: 0,
                shaderLocation: 0,
            }]
        };
        this.uniformBuffer = this.device.createBuffer({
            label: "Uniform buffer",
            size: 64 * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM
        })

        this.bindGroupLayoutRender = this.device.createBindGroupLayout({
            label: "bind group layout render",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" }
            }, {
                binding: 1,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: "read-only-storage" }
            }]
        })

        this.bindGroupLayoutCompute = this.device.createBindGroupLayout({
            label: "bind group layout compute",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "uniform" }
            }, {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" }
            }, {
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }
            }]
        })

        const renderPipelineLayout = this.device.createPipelineLayout({
            label: "Render pipeline layout",
            bindGroupLayouts: [this.bindGroupLayoutRender]
        })

        const computePipelineLayout = this.device.createPipelineLayout({
            label: "Compute pipeline layout",
            bindGroupLayouts: [this.bindGroupLayoutCompute]
        })

        const renderShaderModule = this.device.createShaderModule({
            label: "render shader module",
            code: `
            struct VertexOut {
                @builtin(position) position: vec4f,
                @location(0) velocity: vec2f,
            }

            struct UniformData {
                size: vec2f,
                color_origin: vec4f,
                color_fast: vec4f,
                mouse_position: vec2f,
                color_alpha: f32,
                size_particles: f32,
                power: f32,
                energy_conservation: f32
            }

            @group(0) @binding(0) var<uniform> uni: UniformData;
            @group(0) @binding(1) var<storage> particles: array<vec4f>;

            @vertex
            fn vertex_main(@location(0) pos: vec2f, @builtin(instance_index) instance: u32) -> VertexOut {
                var output: VertexOut;

                let particle = particles[instance];
                output.position = vec4f(uni.size_particles * pos.x / uni.size.x + particle.x / uni.size.x , uni.size_particles * pos.y / uni.size.y + particle.y / uni.size.y, 0, 1);
                //output.position = vec4f(pos.x / uni.size.x, pos.y / uni.size.y, 0, 1);
                output.velocity = vec2f(particle.z, particle.w);

                return output;
            }

            @fragment
            fn fragment_main(in: VertexOut) -> @location(0) vec4f {
                let velocity = length(in.velocity);

                let c_origin = uni.color_origin;
                let c_fast = uni.color_fast;
                
                var ratio_velocity = min(velocity, 10);
                ratio_velocity /= 10;
                
                let c_final = c_fast * ratio_velocity + c_origin * (1 - ratio_velocity);

                return vec4f(c_final.x, c_final.y, c_final.z, uni.color_alpha);
            }
            `
        })
        
        const computeShaderModule = this.device.createShaderModule({
            label: "compute shader module",
            code: `
            struct UniformData {
                size: vec2f,
                color_origin: vec4f,
                color_fast: vec4f,
                mouse_position: vec2f,
                color_alpha: f32,
                size_particles: f32,
                power: f32,
                energy_conservation: f32
            }

            @group(0) @binding(0) var<uniform> uni: UniformData;
            @group(0) @binding(1) var<storage> particles1: array<vec4f>;
            @group(0) @binding(2) var<storage, read_write> particles2: array<vec4f>;
            
            @compute
            @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
            fn computeMain(@builtin(global_invocation_id) id: vec3u, @builtin(num_workgroups) num_work: vec3u) {
                let max_w = vec2u(${WORKGROUP_SIZE} * num_work.x, ${WORKGROUP_SIZE} * num_work.y);
                let id_f = id.x * max_w.y + id.y;

                particles2[id_f] = particles1[id_f];

                let distance = vec2f(
                    uni.mouse_position.x - particles2[id_f].x,
                    uni.mouse_position.y - particles2[id_f].y
                );

                let length = length(distance);
                let d_norm = normalize(distance);
                

                particles2[id_f].z += d_norm.x / ((1 / uni.power) * max(length, 4));
                particles2[id_f].w += d_norm.y / ((1 / uni.power) * max(length, 4));
                
                particles2[id_f].z *= uni.energy_conservation;
                particles2[id_f].w *= uni.energy_conservation;
                
                particles2[id_f].x += particles2[id_f].z;
                particles2[id_f].y += particles2[id_f].w;
                
                /*
                particles2[id_f] = particles1[id_f];
                particles2[id_f].x += particles1[id_f].z;
                particles2[id_f].y += particles1[id_f].w;
                */
            }
            `
        })

        this.renderPipeline = this.device.createRenderPipeline({
            label: "render pipeline",
            layout: renderPipelineLayout,
            vertex: {
                module: renderShaderModule,
                entryPoint: "vertex_main",
                buffers: [vertexBufferLayout]
            },
            fragment: {
                module: renderShaderModule,
                entryPoint: "fragment_main",
                targets: [{
                    format: canvasFormat,
                    blend: {
                        color: {
                            operation: "add",
                            srcFactor: "src-alpha",
                            dstFactor: "one-minus-src-alpha"
                        },
                        alpha: {
                            operation: "add",
                            srcFactor: "one",
                            dstFactor: "zero"
                        }
                    }
                }]
            },
            primitive: {
                topology: "triangle-list"
            }
        });

        this.computePipeline = this.device.createComputePipeline({
            label: "compute pipeline",
            layout: computePipelineLayout,
            compute: {
                module: computeShaderModule,
                entryPoint: "computeMain"
            }
        });

        this.createBuffers()
        this.createBindGroups()
    }

    createBuffers() {
        this.particlesBuffer1 = this.device.createBuffer({
            label: "particles buffer 1",
            size: 16 * this.num_particles,
            usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        });

        this.particlesBuffer2 = this.device.createBuffer({
            label: "particles buffer 2",
            size: 16 * this.num_particles,
            usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        });

        this.mappedBuffer = this.device.createBuffer({
            label: "mapped buffer",
            size: 16 * this.num_particles,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
    }

    createBindGroups() {
        this.bindGroupRenderer1 = this.device.createBindGroup({
            label: "bind group render",
            layout: this.bindGroupLayoutRender,
            entries: [{
                binding: 0,
                resource: { buffer: this.uniformBuffer }
            }, {
                binding: 1,
                resource: { buffer: this.particlesBuffer1 }
            }]
        })

        this.bindGroupRenderer2 = this.device.createBindGroup({
            label: "bind group render",
            layout: this.bindGroupLayoutRender,
            entries: [{
                binding: 0,
                resource: { buffer: this.uniformBuffer }
            }, {
                binding: 1,
                resource: { buffer: this.particlesBuffer2 }
            }]
        })

        this.bindGroupCompute1 = this.device.createBindGroup({
            label: "bind group compute",
            layout: this.bindGroupLayoutCompute,
            entries: [{
                binding: 0,
                resource: { buffer: this.uniformBuffer }
            }, {
                binding: 1,
                resource: { buffer: this.particlesBuffer1 }
            }, {
                binding: 2,
                resource: { buffer: this.particlesBuffer2 }
            }]
        })

        this.bindGroupCompute2 = this.device.createBindGroup({
            label: "bind group compute",
            layout: this.bindGroupLayoutCompute,
            entries: [{
                binding: 0,
                resource: { buffer: this.uniformBuffer }
            }, {
                binding: 1,
                resource: { buffer: this.particlesBuffer2 }
            }, {
                binding: 2,
                resource: { buffer: this.particlesBuffer1 }
            }]
        })

    }

    update_uniform_buffer() {
        const size_canvas = [this.canvas.width, this.canvas.height];
        const c_o = this.color_origin;
        const c_f = this.color_fast;
        const uniformData = new Float32Array([size_canvas[0] / 2, - size_canvas[1] / 2, 0, 0, //For the padding
            c_o[0], c_o[1], c_o[2], c_o[3], 
            c_f[0], c_f[1], c_f[2], c_f[3],
            this.mouse_position[0], this.mouse_position[1],
            this.color_alpha,
            this.size_particles,
            this.power,
            this.energy_conservation
        ])
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
    }

    render() {
        this.update_uniform_buffer();
        const encoder = this.device.createCommandEncoder();

        const renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }]
        })
        if (this.frame == 1) {
            renderPass.setBindGroup(0, this.bindGroupRenderer1)
        } else {
            renderPass.setBindGroup(0, this.bindGroupRenderer2)
        }
        renderPass.setVertexBuffer(0, this.vertexBuffer)
        renderPass.setPipeline(this.renderPipeline)
        renderPass.draw(6, this.num_particles)
        renderPass.end()

        const commandBuffer = encoder.finish()
        this.device.queue.submit([commandBuffer])
    }

    mul2() {
        this.set_num_particles(Math.round(this.num_particles * 2))
    }

    div2() {
        this.set_num_particles(Math.round(this.num_particles / 2))
    }

    set_num_particles(num: number) {
        this.num_particles = num;
        this.particles = new SharedArrayBuffer(num * 4 * 4)
        let particles = new Float32Array(this.particles)
        
        this.particlesBuffer1.destroy()
        this.particlesBuffer2.destroy()
        this.mappedBuffer.destroy()
        
        this.createBuffers()

        for (let i = 0; i < num; i += 1) {
            particles[i * 4] = (Math.random() - 0.5) * 1_000
            particles[i * 4 + 1] = (Math.random() - 0.5) * 1_000
            particles[i * 4 + 2] = 0
            particles[i * 4 + 3] = 0
        }
        
        this.createBindGroups()

        this.device.queue.writeBuffer(this.particlesBuffer1, 0, particles)
        this.device.queue.writeBuffer(this.particlesBuffer2, 0, particles)
    }

    update() {
        if (this.can_update == false) { return }
        switch (this.update_mode) {
            case UpdateMode.CPU: { this.update_cpu(); break; }
            case UpdateMode.GPU: { this.update_gpu(); break; }
        }
        
        this.render();
    }

    update_cpu() {
        this.frame = 1

        let particles = new Float32Array(this.particles)
        for (let i = 0; i < this.num_particles; i += 1) {
            const distance = {
                x: this.mouse_position[0] - particles[i * 4],
                y: this.mouse_position[1] - particles[i * 4 + 1],
            };

            const length = Math.sqrt(distance.x * distance.x + distance.y * distance.y)

            const d_norm = {
                x: distance.x / length,
                y: distance.y / length
            };

            particles[i * 4 + 2] += d_norm.x / ((1 / this.power) * Math.max(length, 4))
            particles[i * 4 + 3] += d_norm.y / ((1 / this.power) * Math.max(length, 4))
            
            particles[i * 4 + 2] *= this.energy_conservation
            particles[i * 4 + 3] *= this.energy_conservation
            
            particles[i * 4] += particles[i * 4 + 2]
            particles[i * 4 + 1] += particles[i * 4 + 3]
        }
        this.device.queue.writeBuffer(this.particlesBuffer1, 0, particles)
    }

    update_gpu() {
        this.update_uniform_buffer();
        const encoder = this.device.createCommandEncoder();

        let pass = encoder.beginComputePass()
        pass.setPipeline(this.computePipeline);
        if (this.frame == 1) {
            pass.setBindGroup(0, this.bindGroupCompute1);
        } else {
            pass.setBindGroup(0, this.bindGroupCompute2);
        }
        pass.dispatchWorkgroups(this.num_particles / ( 4 * WORKGROUP_SIZE * WORKGROUP_SIZE), 4);
        pass.end()

        const commandBuffer = encoder.finish()
        this.device.queue.submit([commandBuffer])

        if (this.frame == 1) {
            this.frame = 2
        } else {
            this.frame = 1
        }
    }

    async change_update_mode(mode: UpdateMode) {
        if (mode == UpdateMode.CPU) {
            let buffer: GPUBuffer;
            if (this.frame == 1) {
                buffer = this.particlesBuffer1
            } else {
                buffer = this.particlesBuffer2
            }


            const encoder = this.device.createCommandEncoder();
            encoder.copyBufferToBuffer(buffer, 0, this.mappedBuffer, 0, this.num_particles * 16);
            const commandBuffer = encoder.finish()
            this.device.queue.submit([commandBuffer])

            this.can_update = false; // Avoid updating while mapAsync not done

            await this.mappedBuffer.mapAsync(GPUMapMode.READ)
            let buffer_content = this.mappedBuffer.getMappedRange();
            let buffer_f32 = new Float32Array(buffer_content);
            let particles_f32 = new Float32Array(this.particles)
            particles_f32.set(buffer_f32)

            this.mappedBuffer.unmap()
            this.device.queue.writeBuffer(this.particlesBuffer1, 0, particles_f32)
            this.frame = 1

            this.can_update = true; // Ok now
        }
    }
}