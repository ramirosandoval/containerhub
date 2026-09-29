# Despliegue de ContainerHub

Este documento detalla el ciclo de vida de empaquetado, distribución y despliegue del proyecto en entornos productivos mediante Docker Swarm.

## 1. Construcción de imágenes

Desde la raíz del monorepo, elige referencias versionadas para **las dos**
imágenes. La aplicación (backend y SPA) y monitoring reutilizan la misma imagen;
el agente tiene la suya. Reemplaza `REGISTRY` y `VERSION` por valores reales
del entorno; no reutilices `latest` como identificador de una versión.

```bash
export CONTAINERHUB_IMAGE=REGISTRY/containerhub:VERSION
export CONTAINERHUB_AGENT_IMAGE=REGISTRY/containerhub-agent:VERSION
docker build --target application -t "$CONTAINERHUB_IMAGE" .
docker build -f packages/containerhub-agent/Dockerfile -t "$CONTAINERHUB_AGENT_IMAGE" .
```

## 2. Distribución de imágenes

`docker stack deploy` no construye la imagen: [Docker muestra que ignora
`build`](https://docs.docker.com/engine/swarm/stack-deploy/#deploy-the-stack-to-the-swarm).
Para un Swarm multinodo, publica ambas imágenes en un registry accesible desde
manager y workers (o cárgalas explícitamente en **cada** nodo elegible):

```bash
docker push "$CONTAINERHUB_IMAGE"
docker push "$CONTAINERHUB_AGENT_IMAGE"
```

Si el registry es privado, autentica los nodos y usa
`docker stack deploy --with-registry-auth` en el paso de despliegue.

## 3. Despliegue manual en Docker Swarm

El stack de ejemplo no es requisito operativo: los tres servicios se pueden desplegar de forma independiente. Conserva estos roles:

| Servicio | Proceso y placement | Puertos y mounts |
| --- | --- | --- |
| `containerhub` | `node packages/containerhub-back/dist/index.js` en un manager | publica la API; monta Docker socket, datos y los roots que docker-devops aprovisiona |
| `containerhub-agent` | `node packages/containerhub-agent/dist/index.js` global en workers | no publica puerto; monta Docker socket, datos y exactamente los mismos roots de host |
| `containerhub-monitoring` | `containerhub-monitoring` desde la misma imagen/tag de `containerhub`, en un manager | no publica puerto; no necesita roots de provisioning |

En Docker DevOps, deja vacío `Comando` para la aplicación y configura
`containerhub-monitoring` como `Comando` del servicio de monitoring. Es un
launcher sin argumentos incluido en la imagen para respetar el contrato de
comando string de Docker DevOps.

Para conservar los volúmenes permitidos por Docker DevOps (`/storage`, `/logs` y `/localdata`), la aplicación en el manager y **cada agente en los workers** deben tener los tres bind mounts con iguales rutas de host y contenedor. Si se despliegan como servicios independientes, configura lo siguiente en **ambos** (el stack `docker-compose.yml` ya lo declara):

```bash
--env CONTAINERHUB_HOST_VOLUME_ROOTS=/storage,/logs,/localdata \
--mount type=bind,src=/storage,dst=/storage \
--mount type=bind,src=/logs,dst=/logs \
--mount type=bind,src=/localdata,dst=/localdata
```

Docker DevOps limita inicialmente la creación de **archivos** a `/storage`; los otros dos roots se conservan para **volúmenes/directorios**. Los paths deben existir y ser escribibles en cada nodo elegible antes de desplegar; el CSV autoriza rutas pero **no** crea mounts. `containerhub_monitoring` no necesita esos roots.

Los roots deben ser escribibles solo por el principal que ejecuta ContainerHub/agent; no uses un host path modificable por usuarios o procesos no confiables.

**No exportes `CONTAINERHUB_STORAGE_ROOT=/storage` para el stack estándar.**
Dejarla sin definir produce `/storage,/logs,/localdata` tanto en el allowlist
de la aplicación como en el del agente. Definirla con `/storage` mantiene los
tres mounts, pero reduce el allowlist de la aplicación a `/storage` mientras
el agente conserva los tres. Si cambias los roots, verifica ambos allowlists
y los mounts en la configuración interpolada antes de desplegar.

## 4. Despliegue por stack (local/producción)

El archivo `docker-compose.yml` (stack) provisto en la raíz del proyecto está preparado para el entorno Swarm. Utiliza restricciones de ubicación (`node.role == manager` para el backend y `node.role == worker` en modo global para los agentes).

Antes de desplegar, selecciona explícitamente la base y la red Mongo del
entorno. El stack **no** crea Mongo ni esa red: por defecto usa la base
`containerhub` en `mongodb://mongo:27017/containerhub` y la red externa
`dockerway_default`. Docker Fortes usa `incartainer`; compartir el servidor
Mongo no demuestra que ambos esquemas de usuarios sean compatibles. No
apuntes a `incartainer` sin verificar esa compatibilidad y sus datos.

Para un stack **dedicado** que conviva en el puerto 9998 (Fortes usa 9999),
además de las dos variables de imagen del paso 1, sustituye estos ejemplos por
las direcciones, base y red reales:

```bash
export CONTAINERHUB_PORT=9998
export CONTAINERHUB_ORIGIN=https://containerhub-dev.example.com
export CONTAINERHUB_MONGO_URI=mongodb://mongo:27017/containerhub
export CONTAINERHUB_MONGO_NETWORK=dockerway_default
export CONTAINERHUB_VAULT_URL=https://vault.example.com
```

`CONTAINERHUB_PORT` controla el listener, el target y el published port.
`CONTAINERHUB_ORIGIN` debe ser el origen exacto que abrirá el navegador; el
valor por defecto del stack es `http://localhost:9998`, no la URL pública.
Termina TLS en el reverse proxy/ingress para accesos fuera de una red de
prueba aislada. El puerto de la aplicación se publica en modo `host` en el
manager; limita el acceso directo con la red/firewall del entorno. No envíes
API keys ni configuración sensible por HTTP en redes compartidas. Vault debe
ser alcanzable desde las tareas: `localhost` dentro del contenedor no es el
manager. App y agente deben usar imágenes accesibles desde sus nodos.

Antes de desplegar, verifica en el manager sin imprimir secretos ni toda la
configuración interpolada:

```bash
docker network inspect "$CONTAINERHUB_MONGO_NETWORK" --format '{{.Name}}'
docker secret inspect containerhub-vault-client-key --format '{{.Spec.Name}}'
docker node ls
docker stack config -c docker-compose.yml >/dev/null
```

Comprueba también que `/storage`, `/logs` y `/localdata` existen y tienen la
propiedad requerida en **cada** manager/worker elegible. `docker stack config`
valida la interpolación, pero no comprueba que las imágenes, Vault, Mongo o los
mounts funcionen en los nodos. Si hay workers `Down`, la tarea global del agente
no estará ejecutándose allí.

El bootstrap está deshabilitado por defecto. Para habilitarlo, define explícitamente `CONTAINERHUB_BOOTSTRAP_ENABLED=true`, el identificador del secreto en Vault y los cuatro campos de identidad. `CONTAINERHUB_BOOTSTRAP_USERNAME` debe contener solo letras y números; el stack no tiene username por defecto.

### Preparación de secretos en Vault

Desde el frontend de Vault, crea el cliente `containerhub` con
`encryptResponse=false` y concédele acceso a `containerhub-jwt` y
`containerhub-api-key`. Para que ContainerHub pueda consultar Vault, crea
**un Docker secret con la clave del cliente de Vault** una sola vez por clúster
Swarm, desde un manager:

```bash
docker secret create containerhub-vault-client-key -
```

Pega el `clientKey` del cliente Vault `containerhub`, presiona Enter y luego
`Ctrl+D`. Docker monta el valor únicamente en los servicios autorizados; no
repitas el comando en los workers. Verifica su existencia sin revelar el valor:

```bash
docker secret inspect containerhub-vault-client-key --format '{{.Spec.Name}}'
```

El resultado esperado es `containerhub-vault-client-key`.

La URL de Vault debe ser alcanzable desde las tareas; `localhost:3080` dentro
del contenedor no apunta al host Swarm.

#### Bootstrap o recuperación del administrador mediante Vault

Son tres objetos distintos:

| Nombre | Dónde se define | Contenido y destino |
| --- | --- | --- |
| `containerhub-bootstrap-password` | **Secreto de Vault**, autorizado para el cliente `containerhub` en el entorno que utiliza ese cliente (por ejemplo, `localDocker`) | Su **valor** es la contraseña elegida para el nuevo usuario de ContainerHub; no se crea como Docker secret. |
| `CONTAINERHUB_VAULT_BOOTSTRAP_PASSWORD_SECRET_ID` | Variable de entorno **no secreta** del servicio ContainerHub | Su valor es solo `containerhub-bootstrap-password`, **no la contraseña**. No tiene valor por defecto; `docker-compose.yml` la recibe desde la shell del manager al desplegar un stack dedicado; `docker service update --env-add` la establece directamente en un servicio ya existente. |
| `containerhub-vault-client-key` | **Docker secret externo** creado arriba | Contiene el `clientKey` del cliente Vault, no la contraseña del usuario. Swarm lo monta como `/run/secrets/containerhub-vault-client-key`. |

Al arrancar, ContainerHub usa el Docker secret para identificarse ante Vault,
solicita el identificador indicado por la variable de entorno y guarda el
**valor devuelto** en `CONTAINERHUB_BOOTSTRAP_PASSWORD` dentro de su proceso.
Luego crea el usuario `Admin` en la base seleccionada **solo si ese username
no existe**. El usuario `root` de Vault es independiente del usuario `root`
de ContainerHub: no se copia su contraseña. La contraseña elegida puede ser la
anterior de ContainerHub, siempre que cumpla la política de contraseñas de Drax;
el bootstrap no modifica la contraseña de un usuario que ya exista.

**Recuperar un servicio existente en el stack compartido `dockerway`:**

1. En la UI de Vault, crea el secreto de Vault identificado como
   `containerhub-bootstrap-password`. Su valor será la contraseña del usuario
   que quieres crear; autoriza al cliente `containerhub` a leerlo. Comprueba que
   ese mismo cliente puede leer `containerhub-jwt` y `containerhub-api-key`, y
   que el Docker secret `containerhub-vault-client-key` ya está montado en el
   servicio. No escribas la contraseña en el repositorio ni en la shell.
2. Desde un manager Swarm, verifica primero que el servicio existe. Si el
   comando siguiente falla o devuelve otro nombre, **detente**: esta operación
   no crea el servicio. Restáuralo desde su definición de despliegue completa
   antes de continuar, sin aplicar este `docker-compose.yml` incompleto al
   stack compartido:

```bash
docker service inspect dockerway_containerhub --format '{{.Spec.Name}}'
docker service inspect dockerway_containerhub --format '{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{println .SecretName}}{{end}}'
```

Salidas esperadas: `dockerway_containerhub` y
`containerhub-vault-client-key`, respectivamente. Comprueba también la imagen
sin mostrar variables ni claves:

```bash
docker service inspect dockerway_containerhub --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
```

Debe ser la imagen prevista de ContainerHub. **No supongas que este servicio
existe**: el nombre es el del despliegue que quieres recuperar, no una
garantía de que sigue instalado.

3. Solo si el servicio existe y Vault ya contiene los tres secretos, configura
   temporalmente el bootstrap **en ese servicio**, sin redesplegar todo el stack.
   Sustituye nombre, username, email y teléfono de ejemplo si corresponde:

```bash
docker service update \
  --env-add CONTAINERHUB_BOOTSTRAP_ENABLED=true \
  --env-add CONTAINERHUB_BOOTSTRAP_NAME=Root \
  --env-add CONTAINERHUB_BOOTSTRAP_USERNAME=root \
  --env-add CONTAINERHUB_BOOTSTRAP_EMAIL=root@example.invalid \
  --env-add CONTAINERHUB_BOOTSTRAP_PHONE=+15555550100 \
  --env-add CONTAINERHUB_VAULT_BOOTSTRAP_PASSWORD_SECRET_ID=containerhub-bootstrap-password \
  dockerway_containerhub

docker service ps dockerway_containerhub --format '{{.CurrentState}} {{.Error}}'
docker service logs --since 5m --tail 50 dockerway_containerhub
```

La tarea nueva debe quedar `Running`; si el usuario no existía, el arranque
registra `User Created. Username: root`. Verifica el inicio de sesión en
ContainerHub como `root` con el **valor del secreto de Vault**, no con la clave
de acceso a Vault. No compartas logs sin revisarlos para excluir secretos.

4. Después de confirmar el inicio de sesión, deshabilita el bootstrap en el
   mismo servicio y retira el identificador del secreto:

```bash
docker service update \
  --env-add CONTAINERHUB_BOOTSTRAP_ENABLED=false \
  --env-rm CONTAINERHUB_VAULT_BOOTSTRAP_PASSWORD_SECRET_ID \
  dockerway_containerhub

docker service ps dockerway_containerhub --format '{{.CurrentState}} {{.Error}}'
```

Si el arranque de bootstrap falla, deshabilítalo igualmente antes de investigar
el error. Luego puedes retirar de Vault `containerhub-bootstrap-password` o
revocar el acceso del cliente, si no lo conservarás como credencial de
recuperación. No cambies `containerhub-jwt` en este procedimiento: invalidaría
las sesiones emitidas y habría que iniciar sesión de nuevo.

**Primer despliegue de un stack dedicado:** en la shell del manager, exporta
`CONTAINERHUB_BOOTSTRAP_ENABLED=true` y
`CONTAINERHUB_VAULT_BOOTSTRAP_PASSWORD_SECRET_ID=containerhub-bootstrap-password`
además de los cuatro campos no secretos `CONTAINERHUB_BOOTSTRAP_NAME`,
`CONTAINERHUB_BOOTSTRAP_USERNAME`, `CONTAINERHUB_BOOTSTRAP_EMAIL` y
`CONTAINERHUB_BOOTSTRAP_PHONE`. `docker-compose.yml` pasa el identificador
al contenedor, no la contraseña. Revisa la configuración interpolada y el
inventario del stack antes de ejecutar `docker stack deploy`; no muestres ni
compartas la configuración completa si contiene credenciales. Tras verificar
el login, exporta `CONTAINERHUB_BOOTSTRAP_ENABLED=false`, ejecuta
`unset CONTAINERHUB_VAULT_BOOTSTRAP_PASSWORD_SECRET_ID` y redespliega ese
mismo stack dedicado. Exportar variables en una shell **sin** redesplegar no
cambia un servicio ya existente; el cambio dirigido anterior sí lo hace.

### Ejecución del despliegue

Desde el manager, despliega **un stack dedicado**, no el stack compartido
`dockerway`: esta definición parcial no incluye sus demás servicios. Usa las
variables exportadas en los pasos anteriores:

```bash
docker stack deploy -c docker-compose.yml containerhub
docker stack services containerhub
docker service ps containerhub_containerhub-agent
```

Si el registry requiere credenciales, añade `--with-registry-auth` a
`docker stack deploy`. Deben correr la aplicación y monitoring en el manager
y una tarea del agente por cada worker Linux `Ready`. Abre
`$CONTAINERHUB_ORIGIN`, inicia sesión con un usuario existente o con el
bootstrap explícito y verifica Nodes. Para probar el camino remoto, hace
falta una tarea real en un worker distinto: no basta con `docker stack config`
ni con que la tarea del manager esté `Running`.

### Integración con Docker DevOps

1. Despliega ContainerHub en paralelo y crea un usuario técnico con un rol que contenga solamente `DOCKER_VIEW`, `DOCKER_CONFIGURATION_VIEW`, `DOCKER_CREATE`, `DOCKER_UPDATE`, `DOCKER_REMOVE`, `DOCKER_NODES_FETCH` y `DOCKER_NETWORK_VIEW`.
2. Genera una API key para ese usuario, limita sus IPv4/IPv6 a las direcciones del backend Docker DevOps cuando la topología lo permita y conserva una copia temporal en el gestor de secretos aprobado para la carga/rotación.
3. En un Environment DEV de Docker DevOps cambia solamente `dockerApiUrl` por la URL HTTPS y `dockerApiToken` por la API key de ContainerHub. Docker DevOps conserva el header Bearer actual.
4. Antes del corte, despliega la corrección de Docker DevOps que elimina el logging del documento `Environment`, del payload `serviceData` y de la respuesta de actualización. Verifica que sus logs no contengan `dockerApiToken` ni valores de env/labels.
5. Trata `dockerApiToken` como una limitación legacy: Docker DevOps lo persiste sin cifrado de campo, lo expone en su GraphQL y lo muestra en las pantallas de Environment. Restringe el CRUD de Environments y el acceso a MongoDB a administradores autorizados; no copies el valor a tickets ni documentación. Restringe, rota y depura los logs históricos según la política de retención porque ejecuciones anteriores a la corrección pueden contener credenciales o configuración.
6. Valida lecturas y un ciclo create/update/delete desechable antes de apagar Docker Fortes.
7. Para rotar la credencial, crea una segunda API key, actualiza los Environments, verifica y recién entonces revoca la anterior.

---

## 5. Transporte interno backend-agent

El stack de compatibilidad usa HTTP/WS sin mTLS entre el backend y el agente
para mantener la topología aceptada de Docker Fortes y evitar infraestructura
adicional en esta sustitución. Es un riesgo aceptado para este alcance, no una
garantía de autenticación o cifrado del canal. [Docker documenta que los datos
de aplicación en overlay no se cifran por defecto](https://docs.docker.com/engine/swarm/networking/#encryption).

El puerto 9997 del agente debe permanecer únicamente en la red overlay
privada: no lo publiques en el host ni lo expongas fuera del Swarm. App y
agente deben compartir esa overlay y los mismos roots/bind mounts. No ejecutes
`deploy-remote-worker-proof.sh init` como paso del stack normal: prepara
certificados para un despliegue mTLS **distinto**. Si más adelante se exige
autenticación fuerte del agente, trátala como un proyecto de infraestructura
separado con identidad de workload y despliegue coordinado en todos los nodos.
