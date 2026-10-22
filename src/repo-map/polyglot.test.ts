import { describe, expect, it } from 'vitest';
import { useTempDirs } from '../__tests__/temp.js';
import { scanRepo } from './index.js';

const repo = useTempDirs('polyglot');

const api = (r: Awaited<ReturnType<typeof scanRepo>>) =>
  r.routes
    .filter((x) => x.kind === 'api')
    .flatMap((x) => (x.methods ?? ['?']).map((m) => `${m} ${x.path}`))
    .sort();
const calls = (r: Awaited<ReturnType<typeof scanRepo>>) => r.apiCalls.map((c) => `${c.method} ${c.path}`).sort();
const stack = (r: Awaited<ReturnType<typeof scanRepo>>) => r.stack.map((s) => s.id);

describe('backends in every language', () => {
  it('Go: Gin groups and net/http method patterns', async () => {
    const r = await scanRepo(
      await repo({
        'go.mod': 'module example.com/shop\n\ngo 1.22\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.10.0\n)\n',
        'main.go': [
          'r := gin.Default()',
          'v1 := r.Group("/api/v1")',
          'v1.GET("/items/:id", show)',
          'v1.POST("/items", create)',
          'mux.HandleFunc("DELETE /api/items/{id}", del)',
          'resp, _ := http.Get("https://example.com/feed")',
        ].join('\n'),
      }),
    );
    expect(stack(r)).toEqual(expect.arrayContaining(['go', 'gin']));
    expect(api(r)).toEqual(['DELETE /api/items/{id}', 'GET /api/v1/items/:id', 'POST /api/v1/items']);
    expect(r.apiCalls).toEqual([]); // a full URL to another host is not this app's API
  });

  it('Rust: Axum routers and Actix attributes', async () => {
    const r = await scanRepo(
      await repo({
        'Cargo.toml': '[package]\nname = "shop"\n\n[dependencies]\naxum = "0.7"\nactix-web = "4"\nserde = "1"\n',
        'src/main.rs': 'let app = Router::new()\n  .route("/api/items", get(list).post(create))\n  .route("/api/items/:id", delete(remove));\n#[get("/health")]\nasync fn health() {}',
      }),
    );
    expect(stack(r)).toEqual(expect.arrayContaining(['rust', 'axum', 'actix']));
    expect(api(r)).toEqual(['DELETE /api/items/:id', 'GET /api/items', 'GET /health', 'POST /api/items']);
  });

  it('Java: Spring controllers and JAX-RS resources', async () => {
    const r = await scanRepo(
      await repo({
        'pom.xml': '<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency><dependency><artifactId>quarkus-rest</artifactId></dependency></dependencies></project>',
        'src/main/java/shop/ItemController.java': '@RestController\n@RequestMapping("/api/items")\npublic class ItemController {\n  @GetMapping\n  public List<Item> list() {}\n  @GetMapping("/{id}")\n  public Item one() {}\n  @PostMapping\n  public Item add() {}\n}',
        'src/main/java/shop/OrderResource.java': '@Path("/api/orders")\npublic class OrderResource {\n  @GET\n  public List<Order> all() {}\n  @DELETE\n  @Path("/{id}")\n  public void remove() {}\n}',
      }),
    );
    expect(stack(r)).toEqual(expect.arrayContaining(['java', 'spring', 'jaxrs']));
    expect(api(r)).toEqual(['DELETE /api/orders/{id}', 'GET /api/items', 'GET /api/items/{id}', 'GET /api/orders', 'POST /api/items']);
  });

  it('Kotlin: Ktor nested routes', async () => {
    const r = await scanRepo(
      await repo({
        'build.gradle.kts': 'dependencies {\n  implementation("io.ktor:ktor-server-core:2.3.0")\n}',
        'src/main/kotlin/App.kt': 'import io.ktor.server.routing.*\nrouting {\n  route("/api") {\n    get("/items") { }\n    post("/items") { }\n  }\n  get("/") { }\n}',
      }),
    );
    expect(stack(r)).toEqual(expect.arrayContaining(['kotlin', 'ktor']));
    expect(api(r)).toEqual(['GET /', 'GET /api/items', 'POST /api/items']);
  });

  it('C#: ASP.NET minimal APIs and controllers', async () => {
    const r = await scanRepo(
      await repo({
        'Shop.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.0" /></ItemGroup></Project>',
        'Program.cs': 'var app = builder.Build();\nvar items = app.MapGroup("/api/items");\nitems.MapGet("/", List);\nitems.MapPost("/", Create);\napp.MapDelete("/api/items/{id}", Delete);',
        'Controllers/OrdersController.cs': '[ApiController]\n[Route("api/[controller]")]\npublic class OrdersController : ControllerBase {\n  [HttpGet]\n  public IActionResult All() {}\n  [HttpGet("{id}")]\n  public IActionResult One(int id) {}\n}',
      }),
    );
    expect(stack(r)).toEqual(expect.arrayContaining(['csharp', 'aspnet', 'efcore']));
    expect(api(r)).toEqual(['DELETE /api/items/{id}', 'GET /api/items', 'GET /api/orders', 'GET /api/orders/{id}', 'POST /api/items']);
  });

  it('PHP: Laravel api routes and Symfony attributes', async () => {
    const r = await scanRepo(
      await repo({
        'composer.json': JSON.stringify({ require: { 'laravel/framework': '^11.0', 'symfony/routing': '^7.0' } }),
        artisan: '#!/usr/bin/env php',
        'routes/api.php': "<?php\nRoute::get('/items', [ItemController::class, 'index']);\nRoute::apiResource('orders', OrderController::class);",
        'src/Controller/CartController.php': "<?php\n#[Route('/cart')]\nclass CartController {\n  #[Route('/add', methods: ['POST'])]\n  public function add() {}\n}",
      }),
    );
    expect(stack(r)).toEqual(expect.arrayContaining(['php', 'laravel', 'symfony']));
    expect(api(r)).toEqual(expect.arrayContaining(['GET /api/items', 'GET /api/orders', 'DELETE /api/orders/{id}', 'POST /cart/add']));
  });

  it('Elixir: Phoenix scopes', async () => {
    const r = await scanRepo(
      await repo({
        'mix.exs': 'defp deps do\n  [{:phoenix, "~> 1.7"}, {:ecto_sql, "~> 3.10"}]\nend',
        'lib/shop_web/router.ex': 'scope "/api", ShopWeb do\n  pipe_through :api\n  get "/items", ItemController, :index\n  resources "/orders", OrderController\nend\nscope "/", ShopWeb do\n  live "/cart", CartLive\nend',
      }),
    );
    expect(stack(r)).toEqual(expect.arrayContaining(['elixir', 'phoenix', 'ecto']));
    expect(api(r)).toEqual(expect.arrayContaining(['GET /api/items', 'POST /api/orders', 'DELETE /api/orders/:id']));
    expect(r.routes.find((x) => x.path === '/cart')!.kind).toBe('page');
  });

  it('Ruby: Sinatra, and Swift: Vapor', async () => {
    const sinatra = await scanRepo(await repo({ Gemfile: "gem 'sinatra'", 'app.rb': "get '/api/items' do\nend\npost '/api/items' do\nend" }));
    expect(api(sinatra)).toEqual(['GET /api/items', 'POST /api/items']);
    const swift = await scanRepo(
      await repo({
        'Package.swift': 'dependencies: [.package(url: "https://github.com/vapor/vapor.git", from: "4.0.0")]',
        'Sources/App/routes.swift': 'app.get("api", "items") { req in }\napp.post("api", "items") { req in }',
      }),
    );
    expect(stack(swift)).toEqual(expect.arrayContaining(['swift', 'vapor']));
    expect(api(swift)).toEqual(['GET /api/items', 'POST /api/items']);
  });
});

describe('API calls in every client language', () => {
  it('finds calls and their methods, ignoring third-party APIs', async () => {
    const r = await scanRepo(
      await repo({
        'web/app.ts': [
          'fetch(`${API_URL}/api/items/${id}`, { method: "DELETE" })',
          'this.http.get<Item[]>("/api/items")',
          'const { data } = useSWR("/api/profile")',
          'fetch(STRIPE_API + "/v1/charges")',
        ].join('\n'),
        'client.py': 'requests.post(f"{BASE_URL}/api/orders", json=o)\nhttpx.get(BASE_URL + "/api/orders")',
        'cmd/client.go': 'req, _ := http.NewRequest("PUT", baseURL+"/api/items/"+id, body)\nhttp.Get(fmt.Sprintf("%s/api/health", base))',
        'src/client.rs': 'client.get(format!("{}/api/items", base)).send().await',
        'Client.cs': 'await _httpClient.GetFromJsonAsync<Item[]>($"{baseUrl}/api/cart");\nvar msg = new HttpRequestMessage(HttpMethod.Patch, "/api/cart/1");',
        'client.php': "<?php\nHttp::post($base . '/api/newsletter');\n$client->get('/api/news');",
        'client.rb': 'HTTParty.get("#{API}/api/reviews")',
        'lib/api.dart': "final r = await http.get(Uri.parse('$baseUrl/api/products'));\nawait dio.post('/api/cart');",
        'ios/Api.swift': 'var request = URLRequest(url: URL(string: "\\(base)/api/checkout")!)\nrequest.httpMethod = "POST"',
        'android/ApiService.kt': 'import retrofit2.http.*\ninterface ApiService {\n  @GET("api/users/{id}")\n  suspend fun user(@Path("id") id: String): User\n}',
      }),
    );
    expect(calls(r)).toEqual(
      [
        'DELETE /api/items/:param',
        'GET /api/items',
        'GET /api/profile',
        'POST /api/orders',
        'GET /api/orders',
        'PUT /api/items/:param',
        'GET /api/health',
        'GET /api/items',
        'GET /api/cart',
        'PATCH /api/cart/1',
        'POST /api/newsletter',
        'GET /api/news',
        'GET /api/reviews',
        'GET /api/products',
        'POST /api/cart',
        'POST /api/checkout',
        'GET /api/users/:param',
      ].sort(),
    );
  });
});
