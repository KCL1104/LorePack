# Cloud Run service for the FastAPI backend (REST + SSE gateway)
#
# This runs alongside Agent Engine:
#   - Cloud Run: serves the frontend-facing API (REST CRUD + SSE streaming)
#   - Agent Engine: serves the A2A protocol for inter-agent collaboration

resource "google_cloud_run_v2_service" "api" {
  for_each = local.deploy_project_ids

  name     = "${var.project_name}-api"
  location = var.region
  project  = each.value

  template {
    service_account = google_service_account.app_sa[each.key].email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${each.value}/${var.project_name}-repo/${var.project_name}-api:latest"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "1Gi"
        }
      }

      # SSE streams can be long-lived
      startup_probe {
        http_get {
          path = "/api/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 10
      }

      liveness_probe {
        http_get {
          path = "/api/health"
        }
        period_seconds = 30
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = each.value
      }

      env {
        name  = "ALLOWED_ORIGINS"
        value = var.frontend_url
      }
    }

    # Allow SSE connections up to 30 minutes
    timeout = "1800s"
  }

  # Allow unauthenticated access (Firebase Auth is handled at app level)
  deletion_protection = false

  depends_on = [google_project_service.deploy_project_services]
}

# Allow public (unauthenticated) invocation — auth is handled by Firebase ID tokens
resource "google_cloud_run_v2_service_iam_member" "api_invoker" {
  for_each = local.deploy_project_ids

  project  = each.value
  location = var.region
  name     = google_cloud_run_v2_service.api[each.key].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Artifact Registry repository for Docker images
resource "google_artifact_registry_repository" "api_repo" {
  for_each = local.deploy_project_ids

  location      = var.region
  project       = each.value
  repository_id = "${var.project_name}-repo"
  format        = "DOCKER"

  depends_on = [google_project_service.deploy_project_services]
}
