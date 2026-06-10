# ========================================
#  Supabase Edge Functions 部署脚本
# ========================================
# 使用方法：
#   1. 右键 → 使用 PowerShell 运行
#   2. 或在 PowerShell 中执行： .\deploy-functions.ps1
# ========================================

$ErrorActionPreference = "Stop"

# 切换到脚本所在目录
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Supabase Edge Functions 部署工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# -------- 1. 检查 supabase CLI ----------
Write-Host "[1/4] 检查 Supabase CLI..." -ForegroundColor Yellow
try {
    $version = & supabase --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Supabase CLI 已安装：$version" -ForegroundColor Green
    } else {
        throw "未找到"
    }
} catch {
    Write-Host "   ❌ Supabase CLI 未安装" -ForegroundColor Red
    Write-Host "   请先执行：npm install -g supabase" -ForegroundColor Gray
    Write-Host "   或访问：https://supabase.com/docs/guides/cli" -ForegroundColor Gray
    exit 1
}
Write-Host ""

# -------- 2. 检查登录状态 ----------
Write-Host "[2/4] 检查登录状态..." -ForegroundColor Yellow
$projects = & supabase projects list 2>$null
if ($LASTEXITCODE -ne 0 -or -not $projects) {
    Write-Host "   ⚠️  未登录，开始登录流程..." -ForegroundColor DarkYellow
    supabase login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ❌ 登录失败" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ✅ 已登录" -ForegroundColor Green
}
Write-Host ""

# -------- 3. 检查并链接项目 ----------
Write-Host "[3/4] 链接项目..." -ForegroundColor Yellow
# 检查是否已链接
if (Test-Path ".\supabase\config.toml") {
    Write-Host "   ✅ 项目已链接（检测到 config.toml）" -ForegroundColor Green
} else {
    Write-Host "   请输入你的 Supabase 项目 Reference ID：" -ForegroundColor Cyan
    Write-Host "   （在 Supabase 控制台 → Project Settings → General → Reference ID 查看）" -ForegroundColor Gray
    $projectId = Read-Host "   项目 ID"

    if ([string]::IsNullOrWhiteSpace($projectId)) {
        Write-Host "   ❌ 项目 ID 不能为空" -ForegroundColor Red
        exit 1
    }

    Write-Host "   正在链接项目..." -ForegroundColor Cyan
    supabase link --project-ref $projectId.Trim()
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ❌ 项目链接失败" -ForegroundColor Red
        exit 1
    }
    Write-Host "   ✅ 项目链接成功" -ForegroundColor Green
}
Write-Host ""

# -------- 4. 部署函数 ----------
Write-Host "[4/4] 部署 Edge Functions..." -ForegroundColor Yellow
Write-Host ""

$functions = @("ai-resolve", "ai-generate", "ai-test-connection")
$successCount = 0
$failCount = 0

foreach ($func in $functions) {
    Write-Host "   正在部署：$func" -ForegroundColor Cyan
    & supabase functions deploy $func
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ $func 部署成功" -ForegroundColor Green
        $successCount++
    } else {
        Write-Host "   ❌ $func 部署失败" -ForegroundColor Red
        $failCount++
    }
    Write-Host ""
}

# -------- 完成总结 ----------
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  部署完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  成功：$successCount / $($functions.Count)" -ForegroundColor Green

if ($failCount -gt 0) {
    Write-Host "  失败：$failCount" -ForegroundColor Red
    Write-Host ""
    Write-Host "  建议：" -ForegroundColor Yellow
    Write-Host "  1. 检查网络连接" -ForegroundColor Gray
    Write-Host "  2. 确认项目权限" -ForegroundColor Gray
    Write-Host "  3. 查看 Supabase 控制台的 Edge Functions 日志" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "  🎉 全部部署成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "  下一步：" -ForegroundColor Cyan
    Write-Host "  1. 登录 Supabase 控制台 → Edge Functions 验证" -ForegroundColor Gray
    Write-Host "  2. 在前端个人中心页面测试 AI 连接" -ForegroundColor Gray
}
Write-Host ""
