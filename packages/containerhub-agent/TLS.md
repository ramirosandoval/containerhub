# Manual de TLS para ContainerHub Agent

El agent usa **mTLS**: el agent presenta un certificado de servidor y ContainerHub presenta un certificado de cliente. El puerto `9997` no se publica en los nodos; ambos servicios se comunican únicamente por una red overlay y el DNS interno de Swarm.

El servidor Node se configura con `requestCert: true` y `rejectUnauthorized: true`: solicita un certificado al cliente y rechaza conexiones que la CA configurada no autoriza ([Node.js 22 — `tls.createServer`](https://nodejs.org/docs/latest-v22.x/api/tls.html#tlscreateserveroptions-secureconnectionlistener)).

Docker permite que servicios conectados a una misma red overlay se comuniquen entre sí ([Docker — Key network concepts](https://docs.docker.com/engine/swarm/networking/#key-network-concepts)). El servicio global usa `endpoint_mode: dnsrr`, por lo que el nombre `containerhub-agent` resuelve las IP de sus tareas en vez de una única VIP balanceada ([Docker — `endpoint_mode`](https://docs.docker.com/reference/compose-file/deploy/#endpoint_mode)). ContainerHub consulta `/health` para asociar cada IP con su `NODE_ID` antes de abrir health, inventario, estadísticas o terminal en el nodo solicitado.

## 1. Requisitos

Ejecutar los comandos desde un manager del Swarm con:

- Docker Engine en modo Swarm;
- OpenSSL;
- una imagen del agent accesible desde todos los nodos;
- el servicio backend de ContainerHub desplegado en el mismo Swarm.

Los certificados y claves se entregan a los servicios mediante Docker secrets. Docker cifra los secrets en tránsito y en reposo, y solo los monta en servicios autorizados mientras sus tareas están en ejecución ([Docker — About secrets](https://docs.docker.com/engine/swarm/secrets/#about-secrets)).

## 2. Crear la CA y los certificados

Usar una CA dedicada para este canal. No reutilizar la CA pública del sitio web.

```bash
install -d -m 700 ./containerhub-agent-pki
cd ./containerhub-agent-pki
umask 077

openssl req -x509 -newkey rsa:4096 -sha256 -nodes -days 3650 \
  -subj '/CN=ContainerHub Agent CA' \
  -keyout ca-key.pem \
  -out ca.pem

openssl req -new -newkey rsa:2048 -sha256 -nodes \
  -subj '/CN=containerhub-agent' \
  -addext 'subjectAltName=DNS:containerhub-agent' \
  -addext 'extendedKeyUsage=serverAuth' \
  -keyout server-key.pem \
  -out server.csr
openssl x509 -req -sha256 -days 825 \
  -in server.csr \
  -CA ca.pem \
  -CAkey ca-key.pem \
  -CAcreateserial \
  -copy_extensions copy \
  -out server-cert.pem

openssl req -new -newkey rsa:2048 -sha256 -nodes \
  -subj '/CN=containerhub-back' \
  -addext 'extendedKeyUsage=clientAuth' \
  -keyout client-key.pem \
  -out client.csr
openssl x509 -req -sha256 -days 825 \
  -in client.csr \
  -CA ca.pem \
  -CAkey ca-key.pem \
  -CAcreateserial \
  -copy_extensions copy \
  -out client-cert.pem

openssl verify -CAfile ca.pem server-cert.pem client-cert.pem
openssl x509 -in server-cert.pem -noout -ext subjectAltName -ext extendedKeyUsage
openssl x509 -in client-cert.pem -noout -ext extendedKeyUsage
```

La primera verificación debe devolver `OK` para ambos certificados. El certificado de servidor debe mostrar `DNS:containerhub-agent`; ese nombre coincide con `CONTAINERHUB_AGENT_SERVER_NAME` y con el alias DNS de la red.

Eliminar los CSR cuando ya no se necesiten. Conservar `ca-key.pem` fuera del Swarm y con acceso restringido: sirve para emitir o renovar certificados, pero ningún servicio necesita montarla.

```bash
rm server.csr client.csr ca.srl
```

## 3. Crear la red interna

La red es externa para que la compartan el stack del agent y el stack que contiene ContainerHub:

```bash
docker network create --driver overlay containerhub-agent-network
```

No publicar `9997` ni agregar `ports` al servicio `agent`. La red overlay es la única ruta de aplicación al listener mTLS.

## 4. Crear los Docker secrets

Ejecutar una sola vez para el alta inicial:

```bash
docker secret create containerhub-agent-ca.pem ca.pem
docker secret create containerhub-agent-server-cert.pem server-cert.pem
docker secret create containerhub-agent-server-key.pem server-key.pem
docker secret create containerhub-agent-client-cert.pem client-cert.pem
docker secret create containerhub-agent-client-key.pem client-key.pem
```

El stack del agent usa la CA, el certificado de servidor y su clave. El backend usa la misma CA, el certificado de cliente y su clave. Docker monta los secrets de Linux en `/run/secrets/<secret_name>` por defecto ([Docker — How Docker manages secrets](https://docs.docker.com/engine/swarm/secrets/#how-docker-manages-secrets)).

## 5. Conectar el backend a la red y a los secrets

Agregar al servicio backend de ContainerHub:

```yaml
services:
  back:
    environment:
      CONTAINERHUB_AGENT_CA_FILE: /run/secrets/containerhub-agent-ca.pem
      CONTAINERHUB_AGENT_CLIENT_CERT_FILE: /run/secrets/containerhub-agent-client-cert.pem
      CONTAINERHUB_AGENT_CLIENT_KEY_FILE: /run/secrets/containerhub-agent-client-key.pem
      CONTAINERHUB_AGENT_HOST: containerhub-agent
      CONTAINERHUB_AGENT_SERVER_NAME: containerhub-agent
      CONTAINERHUB_AGENT_PORT: 9997
    networks:
      - containerhub-agent-network
    secrets:
      - containerhub-agent-ca.pem
      - containerhub-agent-client-cert.pem
      - containerhub-agent-client-key.pem

networks:
  containerhub-agent-network:
    external: true

secrets:
  containerhub-agent-ca.pem:
    external: true
  containerhub-agent-client-cert.pem:
    external: true
  containerhub-agent-client-key.pem:
    external: true
```

`back` es el nombre ilustrativo del servicio: aplicar ese bloque al servicio backend real. Mantener sus otras redes, variables y secrets existentes.

## 6. Construir y desplegar el agent

Desde la raíz del repositorio:

```bash
docker build \
  -f packages/containerhub-agent/Dockerfile \
  -t registry.example.internal/containerhub-agent:VERSION \
  .
docker push registry.example.internal/containerhub-agent:VERSION

CONTAINERHUB_AGENT_IMAGE=registry.example.internal/containerhub-agent:VERSION \
  docker stack deploy \
  --with-registry-auth \
  -c packages/containerhub-agent/stack.yml \
  containerhub-agent
```

Reemplazar `registry.example.internal/containerhub-agent:VERSION` por una referencia inmutable disponible para todos los nodos. Después, volver a desplegar el stack del backend con la red, los secrets y las variables del paso anterior.

## 7. Verificar

### Despliegue y ausencia de puerto publicado

```bash
docker service ps containerhub-agent_agent
docker service inspect containerhub-agent_agent \
  --format 'endpoint={{json .Endpoint.Spec}} published={{json .Endpoint.Ports}}'
```

Debe existir una tarea `Running` por nodo Linux. El endpoint debe indicar modo `dnsrr` y `published` debe ser `null`.

### DNS desde el backend

Obtener el contenedor backend que corre en el manager y resolver el alias desde allí:

```bash
BACKEND_CONTAINER_ID=$(docker ps \
  --filter label=com.docker.swarm.service.name=NOMBRE_SERVICIO_BACKEND \
  --format '{{.ID}}' | sed -n '1p')

docker exec "$BACKEND_CONTAINER_ID" \
  node -e "require('node:dns').promises.resolve4('containerhub-agent').then(console.log)"
```

Reemplazar `NOMBRE_SERVICIO_BACKEND` por el nombre completo del servicio Swarm. La salida debe contener una IP por tarea activa del agent.

### Aplicación

```bash
docker service logs --tail 100 containerhub-agent_agent
docker service logs --tail 100 NOMBRE_SERVICIO_BACKEND
```

En ContainerHub, abrir **Nodes** con un usuario autorizado. Cada nodo con una tarea activa del agent debe aparecer saludable. Esto comprueba DNS, mTLS, identidad `NODE_ID` y acceso al Docker daemon desde el flujo real del backend; no prueba que el puerto sea accesible desde fuera del overlay.

## Problemas frecuentes

| Síntoma | Revisar |
|---|---|
| `ENOTFOUND containerhub-agent` | El backend no está conectado a `containerhub-agent-network` o el agent no está desplegado. |
| `Agent for node ... is unavailable` | Falta la tarea global de ese nodo, DNS no la devuelve o `/health` reporta otro `NODE_ID`. |
| Error de nombre del certificado | El certificado de servidor no contiene `DNS:containerhub-agent` o `CONTAINERHUB_AGENT_SERVER_NAME` fue cambiado. |
| Error TLS de certificado cliente | La CA del agent no firmó el certificado de cliente o el backend no montó certificado/clave correctos. |
| Agent no inicia | Revisar los tres secrets del servidor, `NODE_ID` y el montaje `/var/run/docker.sock`. |
| DNS devuelve una sola VIP | Confirmar `deploy.endpoint_mode: dnsrr` en `containerhub-agent_agent`. |

## Alcance de seguridad

- TLS cifra el canal; el servidor y el cliente validan los certificados con la CA configurada.
- La validación de `NODE_ID` evita consumir una respuesta de otra tarea global.
- El puerto del agent no se publica en interfaces de los nodos.
- El montaje de `/var/run/docker.sock` sigue siendo privilegiado; limitar la red y los secrets a los servicios que realmente los necesitan.
