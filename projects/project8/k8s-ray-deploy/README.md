### 1. Ray Service 核心配置 (k8s-ray-deploy/ray-service.yaml) 
 这是基于 KubeRay Operator 的核心部署文件，实现了以下关键需求： 
 
 - **自动扩缩容** : 在 `workerGroupSpecs` 中配置了 `minReplicas: 1` 和 `maxReplicas: 5` ，以及 `serveConfigV2` 中的应用级扩缩容配置。 
 - **资源管理** : Worker 节点配置了 `nvidia.com/gpu: 1` 以支持模型推理加速。 
 - **Ray Serve 集成** : 定义了 `llm_app` 应用，直接管理推理服务的生命周期。 

 ### 2. Istio 流量控制配置 (k8s-ray-deploy/istio-config.yaml) 
 用于实现 A/B 测试和灰度发布： 
 
 - **Gateway** : 定义了入口网关 `llm-gateway` 。 
 - **VirtualService** : 配置了流量路由规则。 
   - **流量切分** : 演示了将 90% 流量路由到主服务 ( `llm-service-serve-svc` )，10% 流量路由到金丝雀服务 ( `llm-service-canary-serve-svc` )，满足 A/B 测试需求。 
   - **重试与超时** : 配置了请求超时和重试策略，提高服务稳定性。 

 ### 3. 模型部署脚本示例 (k8s-ray-deploy/model_deployment.py) 
 这是 Ray Serve 的 Python 实现代码： 
 
 - **部署定义** : 使用 `@serve.deployment` 装饰器定义了服务。 
 - **vLLM 框架** : 代码结构预留了接入 vLLM (Virtual Large Language Model) 的位置，这是降低模型延迟的关键技术。 
 - **GPU 绑定** : 明确指定了 `ray_actor_options={"num_gpus": 1}` 。 

 ### 使用指南 
 1. **准备环境** : 确保集群已安装 KubeRay Operator 和 Istio。 
 2. **构建镜像** : 您需要将 `model_deployment.py` 和依赖打包到 Docker 镜像中，并更新 `ray-service.yaml` 中的 `image` 字段。 
 3. **应用配置** : 
    ```bash
    kubectl apply -f k8s-ray-deploy/ray-service.yaml 
    kubectl apply -f k8s-ray-deploy/istio-config.yaml 
    ``` 
 这些配置为您的大模型服务提供了一个生产级的高可用、可扩展基础架构。
